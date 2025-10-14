import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Camera, Mic, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const StudentVerify = () => {
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [checks, setChecks] = useState({
    camera: { status: 'pending', message: 'Waiting...' },
    lighting: { status: 'pending', message: 'Waiting...' },
    face: { status: 'pending', message: 'Waiting...' },
    audio: { status: 'pending', message: 'Waiting...' },
  });
  const [verifying, setVerifying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const data = sessionStorage.getItem('studentData');
    if (!data) {
      toast.error("Please register first");
      navigate('/student/register');
      return;
    }
    setStudentData(JSON.parse(data));
  }, [navigate]);

  const startVerification = async () => {
    setVerifying(true);
    
    // Step 1: Camera Access
    setCurrentStep(1);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setChecks(prev => ({
        ...prev,
        camera: { status: 'success', message: 'Camera access granted' }
      }));

      // Step 2: Lighting Check
      setTimeout(() => {
        setCurrentStep(2);
        setChecks(prev => ({
          ...prev,
          lighting: { status: 'checking', message: 'Analyzing lighting conditions...' }
        }));

        setTimeout(() => {
          setChecks(prev => ({
            ...prev,
            lighting: { status: 'success', message: 'Good lighting detected' }
          }));

          // Step 3: Face Detection
          setCurrentStep(3);
          setChecks(prev => ({
            ...prev,
            face: { status: 'checking', message: 'Detecting face...' }
          }));

          setTimeout(() => {
            setChecks(prev => ({
              ...prev,
              face: { status: 'success', message: 'Single person detected' }
            }));

            // Step 4: Audio Check
            setCurrentStep(4);
            setChecks(prev => ({
              ...prev,
              audio: { status: 'checking', message: 'Testing microphone...' }
            }));

            setTimeout(() => {
              setChecks(prev => ({
                ...prev,
                audio: { status: 'success', message: 'Microphone working' }
              }));

              // All checks complete
              toast.success("Environment verification complete!");
              setTimeout(() => {
                navigate('/student/exam');
              }, 1500);
            }, 1500);
          }, 2000);
        }, 1500);
      }, 1000);

    } catch (error) {
      console.error('Camera access error:', error);
      setChecks(prev => ({
        ...prev,
        camera: { status: 'error', message: 'Camera access denied' }
      }));
      toast.error("Please allow camera and microphone access");
      setVerifying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'success') return <CheckCircle2 className="w-5 h-5 text-success" />;
    if (status === 'error') return <AlertCircle className="w-5 h-5 text-destructive" />;
    if (status === 'checking') return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    return <div className="w-5 h-5 rounded-full border-2 border-muted" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'success') return 'border-success bg-success/5';
    if (status === 'error') return 'border-destructive bg-destructive/5';
    if (status === 'checking') return 'border-primary bg-primary/5';
    return 'border-border';
  };

  if (!studentData) return null;

  const progress = (currentStep / 4) * 100;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">ExamEye Shield</h1>
              <p className="text-sm text-muted-foreground">Student Dashboard</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Subject Code</p>
            <p className="text-sm font-mono font-semibold">{studentData.subjectCode}</p>
          </div>
        </div>

        {!verifying ? (
          <>
            {/* Welcome Card */}
            <Card className="mb-6">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold mb-2">Welcome to Your Exam</h2>
                <p className="text-muted-foreground mb-6">
                  Before we begin, we need to verify your environment
                </p>
              </CardContent>
            </Card>

            {/* Environment Checks */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Camera Check</h3>
                      <p className="text-sm text-muted-foreground">Verify webcam access</p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                      Good lighting required
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                      Face must be visible
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                      Only one person allowed
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                      <Mic className="w-6 h-6 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Audio Check</h3>
                      <p className="text-sm text-muted-foreground">Verify microphone access</p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                      Quiet environment needed
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                      No background voices
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                      Microphone must work
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Important Rules */}
            <Card className="mb-6 border-warning bg-warning/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
                  <h3 className="font-semibold">Important Rules</h3>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-warning mt-1">▸</span>
                    Looking away from screen more than 3 times will trigger a violation
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-warning mt-1">▸</span>
                    Switching tabs or copying text will be flagged
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-warning mt-1">▸</span>
                    Mobile phones or devices in view will be detected
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-warning mt-1">▸</span>
                    Multiple faces in frame will trigger an alert
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                Go Back
              </Button>
              <Button onClick={startVerification} className="flex-1" size="lg">
                Start Environment Check
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Verification in Progress */}
            <Card>
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold mb-2">Environment Verification</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  We need to verify your exam environment before starting
                </p>

                <Progress value={progress} className="mb-8" />

                <div className="space-y-4">
                  <div className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${getStatusColor(checks.camera.status)}`}>
                    {getStatusIcon(checks.camera.status)}
                    <div className="flex-1">
                      <h3 className="font-semibold">Camera Access</h3>
                      <p className="text-sm text-muted-foreground">{checks.camera.message}</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${getStatusColor(checks.lighting.status)}`}>
                    {getStatusIcon(checks.lighting.status)}
                    <div className="flex-1">
                      <h3 className="font-semibold">Lighting Check</h3>
                      <p className="text-sm text-muted-foreground">{checks.lighting.message}</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${getStatusColor(checks.face.status)}`}>
                    {getStatusIcon(checks.face.status)}
                    <div className="flex-1">
                      <h3 className="font-semibold">Face Detection</h3>
                      <p className="text-sm text-muted-foreground">{checks.face.message}</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${getStatusColor(checks.audio.status)}`}>
                    {getStatusIcon(checks.audio.status)}
                    <div className="flex-1">
                      <h3 className="font-semibold">Audio Check</h3>
                      <p className="text-sm text-muted-foreground">{checks.audio.message}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hidden video element for camera stream */}
            <video ref={videoRef} autoPlay muted className="hidden" />
          </>
        )}
      </div>
    </div>
  );
};

export default StudentVerify;
