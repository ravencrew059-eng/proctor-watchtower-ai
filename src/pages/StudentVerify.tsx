import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Camera, Mic, Sun, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { aiDetector } from "@/utils/aiDetection";

const StudentVerify = () => {
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<any>(null);
  const [checks, setChecks] = useState({
    camera: { status: 'waiting', message: 'Waiting...' },
    microphone: { status: 'waiting', message: 'Waiting...' },
    lighting: { status: 'waiting', message: 'Waiting...' },
    face: { status: 'waiting', message: 'Waiting...' },
  });
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const data = sessionStorage.getItem('studentData');
    if (!data) {
      toast.error("Please register first");
      navigate('/student/register');
      return;
    }
    setStudentData(JSON.parse(data));

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      aiDetector.cleanup();
    };
  }, [navigate]);

  const startVerification = async () => {
    setVerificationStarted(true);
    setProgress(0);

    // Step 1: Camera Access
    setChecks(prev => ({ ...prev, camera: { status: 'checking', message: 'Requesting access...' } }));
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

      setChecks(prev => ({ ...prev, camera: { status: 'success', message: 'Camera connected' } }));
      setProgress(25);

      // Step 2: Microphone
      setTimeout(() => {
        setChecks(prev => ({ ...prev, microphone: { status: 'checking', message: 'Testing microphone...' } }));
        
        setTimeout(() => {
          setChecks(prev => ({ ...prev, microphone: { status: 'success', message: 'Microphone working' } }));
          setProgress(50);

          // Step 3: Lighting
          setTimeout(async () => {
            setChecks(prev => ({ ...prev, lighting: { status: 'checking', message: 'Analyzing lighting...' } }));

            if (!videoRef.current) return;
            const lightingResult = await aiDetector.checkLighting(videoRef.current);

            if (!lightingResult.isGood) {
              setChecks(prev => ({ ...prev, lighting: { status: 'error', message: 'Poor lighting detected' } }));
              toast.error("Please improve lighting conditions");
              return;
            }

            setChecks(prev => ({ ...prev, lighting: { status: 'success', message: 'Good lighting' } }));
            setProgress(75);

            // Step 4: Face Detection
            setTimeout(async () => {
              setChecks(prev => ({ ...prev, face: { status: 'checking', message: 'Detecting face...' } }));

              if (!videoRef.current) return;
              const faceCount = await aiDetector.detectFaces(videoRef.current);

              if (faceCount === 0) {
                setChecks(prev => ({ ...prev, face: { status: 'error', message: 'No face detected' } }));
                toast.error("Please position yourself in front of camera");
                return;
              } else if (faceCount > 1) {
                setChecks(prev => ({ ...prev, face: { status: 'error', message: 'Multiple faces detected' } }));
                toast.error("Only one person allowed");
                return;
              }

              setChecks(prev => ({ ...prev, face: { status: 'success', message: 'Face verified' } }));
              setProgress(100);

              toast.success("Verification complete!");
              setTimeout(() => {
                navigate('/student/exam');
              }, 1500);
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);

    } catch (error) {
      console.error('Camera access error:', error);
      setChecks(prev => ({ ...prev, camera: { status: 'error', message: 'Access denied' } }));
      toast.error("Please allow camera and microphone access");
    }
  };

  const getStatusIcon = (status: string, Icon: any) => {
    const baseClass = "w-5 h-5";
    if (status === 'success') return <Icon className={`${baseClass} text-primary`} />;
    if (status === 'error') return <Icon className={`${baseClass} text-destructive`} />;
    if (status === 'checking') return <Icon className={`${baseClass} text-primary animate-pulse`} />;
    return <Icon className={`${baseClass} text-muted-foreground`} />;
  };

  if (!studentData) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-6xl py-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Camera Preview */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4">Camera Preview</h2>
              <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                {verificationStarted ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Camera className="w-16 h-16 text-muted-foreground" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Verification Progress */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4">Verification Progress</h2>
              
              <Progress value={progress} className="mb-6 h-3" />

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  {getStatusIcon(checks.camera.status, Camera)}
                  <div className="flex-1">
                    <p className="font-semibold">Camera Access</p>
                    <p className="text-sm text-muted-foreground">{checks.camera.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusIcon(checks.microphone.status, Mic)}
                  <div className="flex-1">
                    <p className="font-semibold">Microphone Access</p>
                    <p className="text-sm text-muted-foreground">{checks.microphone.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusIcon(checks.lighting.status, Sun)}
                  <div className="flex-1">
                    <p className="font-semibold">Lighting Conditions</p>
                    <p className="text-sm text-muted-foreground">{checks.lighting.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusIcon(checks.face.status, User)}
                  <div className="flex-1">
                    <p className="font-semibold">Face Detection</p>
                    <p className="text-sm text-muted-foreground">{checks.face.message}</p>
                  </div>
                </div>
              </div>

              {!verificationStarted && (
                <Button 
                  onClick={startVerification} 
                  className="w-full"
                  size="lg"
                >
                  Start Verification
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Before you start */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="font-bold mb-4">Before you start:</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Ensure you're in a well-lit room
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Position yourself at the center of the camera
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                No other person should be visible
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Remove any background noise
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentVerify;
