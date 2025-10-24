import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Clock, AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { aiDetector } from "@/utils/aiDetection";
import { violationLogger } from "@/utils/violationLogger";

const StudentExam = () => {
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState(3600);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [examId, setExamId] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [recentWarnings, setRecentWarnings] = useState<string[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
        recordViolation('tab_switch', 'Tab switched');
        setRecentWarnings(prev => ['Tab switching detected', ...prev].slice(0, 3));
      }
    };

    const handleCopyPaste = (e: Event) => {
      e.preventDefault();
      if (examId && studentData) {
        recordViolation('copy_paste', 'Copy/paste attempted');
        setRecentWarnings(prev => ['Copy/paste detected', ...prev].slice(0, 3));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      aiDetector.cleanup();
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
      }
      
      streamRef.current = stream;
      await aiDetector.initialize();
      startAIMonitoring();
    } catch (error) {
      console.error('Camera error:', error);
      toast.error("Camera access required");
    }
  };

  const startAIMonitoring = () => {
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !streamRef.current || !examId || !studentData) return;

      try {
        const violations = await aiDetector.detectObjects(videoRef.current);
        
        for (const violation of violations) {
          const snapshot = aiDetector.captureSnapshot(videoRef.current);
          
          await violationLogger.logDetectionViolation(
            examId,
            studentData.id,
            studentData.name,
            violation,
            snapshot
          );

          setViolationCount(prev => prev + 1);
          const message = violation.type.replace(/_/g, ' ');
          setRecentWarnings(prev => [message, ...prev].slice(0, 3));
          
          toast.error(`Violation: ${message}`);
        }

        const audioLevel = await aiDetector.analyzeAudioLevel(streamRef.current);
        if (audioLevel.isNoisy) {
          const shouldLog = aiDetector.incrementViolation('audioNoise');
          if (shouldLog) {
            const snapshot = aiDetector.captureSnapshot(videoRef.current);
            await violationLogger.logDetectionViolation(
              examId,
              studentData.id,
              studentData.name,
              { type: 'audio_noise', confidence: 0.8, timestamp: new Date() },
              snapshot
            );
            setViolationCount(prev => prev + 1);
            setRecentWarnings(prev => ['Suspicious audio', ...prev].slice(0, 3));
            aiDetector.resetViolation('audioNoise');
          }
        }
      } catch (error) {
        console.error('AI monitoring error:', error);
      }
    }, 2000);
  };

  const loadExamQuestions = async () => {
    try {
      const { data: questionsData, error } = await supabase
        .from('exam_questions')
        .select('*')
        .order('question_number');

      if (error) throw error;

      if (questionsData && questionsData.length > 0) {
        setQuestions(questionsData);
      } else {
        setQuestions([
          { id: 1, question_number: 1, question_text: "Explain the concept of artificial intelligence and its applications in modern proctoring systems.", question_type: "short_answer" },
          { id: 2, question_number: 2, question_text: "Describe how computer vision techniques can be used for real-time monitoring.", question_type: "short_answer" },
          { id: 3, question_number: 3, question_text: "What are the ethical considerations in AI-powered proctoring systems?", question_type: "short_answer" },
        ]);
      }
    } catch (error) {
      console.error('Error loading questions:', error);
    }
  };

  const startExam = async (data: any) => {
    try {
      const { data: exams, error } = await supabase
        .from('exams')
        .select('id')
        .eq('subject_code', data.subjectCode)
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

  const recordViolation = async (type: string, details: string) => {
    if (!examId || !studentData) return;

    try {
      const snapshot = videoRef.current ? aiDetector.captureSnapshot(videoRef.current) : '';
      
      if (snapshot) {
        await violationLogger.logDetectionViolation(
          examId,
          studentData.id,
          studentData.name,
          { type: type as any, confidence: 1.0, timestamp: new Date() },
          snapshot
        );
      } else {
        await supabase
          .from('violations')
          .insert({
            exam_id: examId,
            student_id: studentData.id,
            violation_type: type,
            severity: 'medium',
            details: { message: details }
          });
      }

      setViolationCount(prev => prev + 1);
      toast.warning("Violation recorded: " + details);
    } catch (error) {
      console.error('Error recording violation:', error);
    }
  };

  const handleSubmit = async () => {
    if (!examId) return;

    try {
      const promises = Object.entries(answers).map(([questionNum, answer]) =>
        supabase
          .from('exam_answers')
          .upsert({
            exam_id: examId,
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
              <p className="text-xs text-muted-foreground">{studentData.name} ({studentData.studentId})</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
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
                    <div key={question.id} className="space-y-3">
                      <h3 className="font-semibold">Question {index + 1}:</h3>
                      <p className="text-muted-foreground">{question.question_text}</p>
                      
                      <Textarea
                        placeholder="Type your answer here..."
                        value={answers[question.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                        rows={6}
                        className="resize-none"
                      />
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
                
                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    className="w-full h-full object-cover"
                  />
                </div>
              </CardContent>
            </Card>

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
