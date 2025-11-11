import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Clock, AlertTriangle, LogOut, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProctoringWebSocket } from "@/hooks/useProctoringWebSocket";
import { AudioMonitor } from "@/components/AudioMonitor";
import { BrowserActivityMonitor } from "@/components/BrowserActivityMonitor";

const StudentExam = () => {
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState(3600);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [examId, setExamId] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [recentWarnings, setRecentWarnings] = useState<string[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [calibratedPitch, setCalibratedPitch] = useState(0);
  const [calibratedYaw, setCalibratedYaw] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [copyPasteCount, setCopyPasteCount] = useState(0);
  const [windowFocused, setWindowFocused] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // WebSocket connection for Python backend
  const { isConnected: wsConnected, sendFrame } = useProctoringWebSocket({
    sessionId: examId || '',
    examId: examId || '',
    studentId: studentData?.id || '',
    studentName: studentData?.name || '',
    calibratedPitch,
    calibratedYaw,
    onViolation: async (violation) => {
      // Handle AI-detected violation from Python backend
      setViolationCount(prev => prev + 1);
      const message = violation.message || violation.type.replace(/_/g, ' ');
      setRecentWarnings(prev => [message, ...prev].slice(0, 3));
      toast.error(`Violation: ${message}`);

      // Upload snapshot ONLY for AI-detected violations (not browser activity)
      if (violation.snapshot_base64 && examId && studentData) {
        try {
          // Convert base64 to blob
          const byteString = atob(violation.snapshot_base64.split(',')[1]);
          const mimeString = violation.snapshot_base64.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeString });

          // Upload to Supabase Storage
          const fileName = `${examId}_${studentData.id}_${Date.now()}_${violation.type}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('violation-evidence')
            .upload(fileName, blob, {
              contentType: 'image/jpeg',
              cacheControl: '3600',
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('violation-evidence')
            .getPublicUrl(fileName);

          // Log to database with image
          await supabase.from('violations').insert({
            exam_id: examId,
            student_id: studentData.id,
            violation_type: violation.type,
            severity: violation.severity || 'medium',
            image_url: publicUrl,
            details: {
              message: violation.message,
              confidence: violation.confidence,
            },
          });
        } catch (error) {
          console.error('Error logging violation with snapshot:', error);
        }
      }
    },
    enabled: !!examId && !!studentData,
  });

  useEffect(() => {
    const data = sessionStorage.getItem('studentData');
    if (!data) {
      toast.error("Please register first");
      navigate('/student/register');
      return;
    }
    const parsedData = JSON.parse(data);
    setStudentData(parsedData);

    startExam(parsedData);
    loadExamQuestions();
    initializeMonitoring();

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden && examId && studentData) {
        setTabSwitchCount(prev => prev + 1);
        recordBrowserViolation('tab_switch', 'Tab switched');
        setRecentWarnings(prev => ['Tab switching detected', ...prev].slice(0, 3));
      }
      setWindowFocused(!document.hidden);
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (examId && studentData) {
        setCopyPasteCount(prev => prev + 1);
        recordBrowserViolation('copy_detected', 'Copy attempted');
        setRecentWarnings(prev => ['Copy detected', ...prev].slice(0, 3));
        toast.warning('Copy action detected');
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      if (examId && studentData) {
        setCopyPasteCount(prev => prev + 1);
        recordBrowserViolation('paste_detected', 'Paste attempted');
        setRecentWarnings(prev => ['Paste detected', ...prev].slice(0, 3));
        toast.warning('Paste action detected');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopy as any);
    document.addEventListener('paste', handlePaste as any);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopy as any);
      document.removeEventListener('paste', handlePaste as any);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [navigate]);

  const initializeMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: true 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      streamRef.current = stream;

      // Setup audio monitoring
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      // Get calibration from session storage
      const calibrationData = sessionStorage.getItem('calibration');
      if (calibrationData) {
        const { pitch, yaw } = JSON.parse(calibrationData);
        setCalibratedPitch(pitch);
        setCalibratedYaw(yaw);
      }

      startAIMonitoring();
    } catch (error) {
      console.error('Camera error:', error);
      toast.error("Camera access required");
    }
  };

  const captureSnapshot = (videoElement: HTMLVideoElement): string => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoElement, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return '';
  };

  const startAIMonitoring = () => {
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !streamRef.current || !examId || !studentData || !wsConnected) return;

      try {
        // Capture frame and audio level
        const snapshot = captureSnapshot(videoRef.current);
        
        // Get audio level
        let audioLevel = 0;
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          audioLevel = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(audioLevel); // Update audio level in real-time
        }

        // Send frame to Python backend via WebSocket
        sendFrame(snapshot, audioLevel);
      } catch (error) {
        console.error('AI monitoring error:', error);
      }
    }, 2000); // Every 2 seconds
  };

  const loadExamQuestions = async () => {
    try {
      const data = sessionStorage.getItem('studentData');
      if (!data) return;
      
      const parsedData = JSON.parse(data);
      
      // Get exam template ID for this subject
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('exam_template_id')
        .eq('subject_code', parsedData.subjectCode)
        .eq('student_id', parsedData.id)
        .single();

      if (examError) throw examError;

      // Get template duration
      const { data: templateData } = await supabase
        .from('exam_templates')
        .select('duration_minutes')
        .eq('id', examData.exam_template_id)
        .single();

      // Set exam duration from template (default 15 minutes)
      const durationMinutes = templateData?.duration_minutes || 15;
      setTimeRemaining(durationMinutes * 60);

      // Load questions for this exam template
      const { data: questionsData, error } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('exam_template_id', examData.exam_template_id)
        .order('question_number');

      if (error) throw error;

      if (questionsData && questionsData.length > 0) {
        setQuestions(questionsData);
      } else {
        toast.error("No questions found for this exam");
      }
    } catch (error) {
      console.error('Error loading questions:', error);
      toast.error("Failed to load exam questions");
    }
  };

  const startExam = async (data: any) => {
    try {
      const { data: exams, error } = await supabase
        .from('exams')
        .select('id')
        .eq('subject_code', data.subjectCode)
        .eq('student_id', data.id)
        .single();

      if (error) throw error;

      setExamId(exams.id);

      await supabase
        .from('exams')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', exams.id);

    } catch (error) {
      console.error('Error starting exam:', error);
    }
  };

  // Record browser activity violations (NO snapshots for these)
  const recordBrowserViolation = async (type: string, details: string) => {
    if (!examId || !studentData) return;

    try {
      await supabase
        .from('violations')
        .insert({
          exam_id: examId,
          student_id: studentData.id,
          violation_type: type,
          severity: 'low',
          details: { message: details }
        });

      setViolationCount(prev => prev + 1);
    } catch (error) {
      console.error('Error recording browser violation:', error);
    }
  };

  const handleSubmit = async () => {
    if (!examId || !studentData) return;

    try {
      const promises = Object.entries(answers).map(([questionNum, answer]) =>
        supabase
          .from('exam_answers')
          .upsert({
            exam_id: examId,
            student_id: studentData.id,
            question_number: parseInt(questionNum),
            answer: answer,
            updated_at: new Date().toISOString()
          })
      );

      await Promise.all(promises);

      await supabase
        .from('exams')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', examId);

      toast.success("Exam submitted!");
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      setTimeout(() => navigate('/'), 2000);
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error("Failed to submit");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!studentData) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold">Proctored Exam</h1>
              <p className="text-xs text-muted-foreground">{studentData.name} - {studentData.subjectName || studentData.subjectCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {wsConnected ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-orange-500" />
              )}
              <Clock className="w-4 h-4" />
              <span className="text-lg font-mono font-bold">{formatTime(timeRemaining)}</span>
            </div>
            <Button variant="destructive" size="sm" onClick={handleSubmit}>
              <LogOut className="w-4 h-4 mr-2" />
              End Exam
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold mb-6">Examination Paper</h2>
                
                <div className="space-y-8">
                  {questions.map((question, index) => (
                    <div key={question.id} className="space-y-4 p-4 border rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-primary">Q{question.question_number}.</span>
                        <p className="font-medium flex-1">{question.question_text}</p>
                      </div>
                      
                      {question.question_type === 'mcq' && question.options ? (
                        <div className="space-y-3 ml-6">
                          {Object.entries(question.options).map(([key, value]: [string, any]) => (
                            <label
                              key={key}
                              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-accent ${
                                answers[question.question_number] === key
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`question-${question.question_number}`}
                                value={key}
                                checked={answers[question.question_number] === key}
                                onChange={(e) =>
                                  setAnswers({ ...answers, [question.question_number]: e.target.value })
                                }
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <span className="font-semibold text-sm uppercase mr-2">{key})</span>
                                <span>{value}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <Textarea
                          placeholder="Type your answer here..."
                          value={answers[question.question_number] || ''}
                          onChange={(e) =>
                            setAnswers({ ...answers, [question.question_number]: e.target.value })
                          }
                          rows={6}
                          className="resize-none ml-6"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Live Monitoring */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <h3 className="font-semibold">Live Monitoring</h3>
                  </div>
                  <Badge variant="destructive" className="text-xs">LIVE</Badge>
                </div>
                
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border-2 border-primary">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <Badge variant="destructive" className="text-xs">
                      🔴 MONITORING
                    </Badge>
                    <Badge className="text-xs bg-green-600">
                      ✓ Active Monitoring
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audio Monitor */}
            <AudioMonitor audioLevel={audioLevel} threshold={30} />

            {/* Browser Activity Monitor */}
            <BrowserActivityMonitor 
              tabSwitches={tabSwitchCount}
              copyPasteEvents={copyPasteCount}
              windowFocus={windowFocused}
            />

            {/* Active Alerts */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <h3 className="font-semibold">Active Alerts</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {recentWarnings.length > 0 ? recentWarnings[0] : 'No violations detected'}
                </p>
              </CardContent>
            </Card>

            {/* Total Violations */}
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-6xl font-bold text-destructive">{violationCount}</p>
                <p className="text-sm text-muted-foreground mt-2">Total Violations</p>
              </CardContent>
            </Card>

            {/* Recent Warnings */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Recent Warnings</h3>
                {recentWarnings.length > 0 ? (
                  <div className="space-y-2">
                    {recentWarnings.map((warning, index) => (
                      <p key={index} className="text-sm text-muted-foreground capitalize">{warning}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No warnings yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentExam;
