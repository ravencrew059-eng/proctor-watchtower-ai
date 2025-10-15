import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Clock, VideoOff, Video, Save, AlertTriangle } from "lucide-react";
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
  const [cameraActive, setCameraActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(3600); // 60 minutes in seconds
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [examId, setExamId] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const questions = [
    { id: 1, text: "What is the capital of France?" },
    { id: 2, text: "Explain the concept of object-oriented programming." },
    { id: 3, text: "What are the three main types of machine learning?" },
  ];

  useEffect(() => {
    const data = sessionStorage.getItem('studentData');
    if (!data) {
      toast.error("Please register first");
      navigate('/student/register');
      return;
    }
    const parsedData = JSON.parse(data);
    setStudentData(parsedData);

    // Get exam ID and start exam
    startExam(parsedData);

    // Start camera and AI monitoring
    initializeMonitoring();

    // Timer countdown
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

    // Track tab visibility for violation detection
    const handleVisibilityChange = () => {
      if (document.hidden && examId && studentData) {
        recordViolation('tab_switch', 'Student switched tabs');
      }
    };

    // Prevent copy/paste
    const handleCopyPaste = (e: Event) => {
      e.preventDefault();
      if (examId && studentData) {
        recordViolation('copy_paste', 'Copy/paste attempted');
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
      setCameraActive(true);

      // Initialize AI detector
      await aiDetector.initialize();
      console.log('AI monitoring initialized');

      // Start AI detection loop
      startAIMonitoring();
    } catch (error) {
      console.error('Camera error:', error);
      toast.error("Camera access required for exam");
    }
  };

  const startAIMonitoring = () => {
    // Run detection every 3 seconds
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !streamRef.current || !examId || !studentData) return;

      try {
        // Object detection
        const violations = await aiDetector.detectObjects(videoRef.current);
        
        for (const violation of violations) {
          const snapshot = aiDetector.captureSnapshot(videoRef.current);
          
          await violationLogger.logDetectionViolation(
            examId,
            studentData.id,
            violation,
            snapshot
          );

          setViolationCount(prev => prev + 1);
          
          toast.error(`Violation: ${violation.type.replace('_', ' ')}`, {
            description: 'This incident has been reported to the admin'
          });
        }

        // Audio check
        const audioLevel = await aiDetector.analyzeAudioLevel(streamRef.current);
        if (audioLevel.isNoisy) {
          const shouldLog = aiDetector.incrementViolation('audioNoise');
          if (shouldLog) {
            const snapshot = aiDetector.captureSnapshot(videoRef.current);
            await violationLogger.logDetectionViolation(
              examId,
              studentData.id,
              { type: 'audio_noise', confidence: 0.8, timestamp: new Date() },
              snapshot
            );
            setViolationCount(prev => prev + 1);
            aiDetector.resetViolation('audioNoise');
            toast.warning('Suspicious audio detected');
          }
        }
      } catch (error) {
        console.error('AI monitoring error:', error);
      }
    }, 3000);
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

      // Update exam status to in_progress
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

  const handleSaveDraft = async () => {
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
      toast.success("Draft saved successfully");
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error("Failed to save draft");
    }
  };

  const handleSubmit = async () => {
    if (!examId) return;

    try {
      // Save all answers
      await handleSaveDraft();

      // Update exam status
      await supabase
        .from('exams')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', examId);

      toast.success("Exam submitted successfully!");
      
      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error) {
      console.error('Error submitting exam:', error);
      toast.error("Failed to submit exam");
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!studentData) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold">ExamEye Shield</h1>
              <p className="text-xs text-muted-foreground">Exam in Progress</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm font-semibold">Violations: {violationCount}</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Subject Code</p>
              <p className="text-sm font-mono font-semibold">{studentData.subjectCode}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold mb-6">Exam Questions</h2>
                
                <div className="space-y-8">
                  {questions.map((question, index) => (
                    <div key={question.id} className="space-y-3">
                      <div>
                        <h3 className="font-semibold mb-1">Question {index + 1}</h3>
                        <p className="text-muted-foreground">{question.text}</p>
                      </div>
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

                <div className="flex gap-4 mt-8">
                  <Button variant="outline" onClick={handleSaveDraft} className="flex-1">
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button onClick={handleSubmit} className="flex-1">
                    Submit Exam
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Timer */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Time Remaining</h3>
                </div>
                <div className="text-3xl font-bold font-mono text-center">
                  {formatTime(timeRemaining)}
                </div>
              </CardContent>
            </Card>

            {/* Camera Status */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  {cameraActive ? (
                    <Video className="w-5 h-5 text-success" />
                  ) : (
                    <VideoOff className="w-5 h-5 text-destructive" />
                  )}
                  <h3 className="font-semibold">Camera Status</h3>
                </div>
                
                <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-3">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {cameraActive ? "AI Monitoring Active" : "Camera Inactive"}
                  </span>
                  {cameraActive && (
                    <Badge variant="outline" className="text-xs">
                      Live
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentExam;
