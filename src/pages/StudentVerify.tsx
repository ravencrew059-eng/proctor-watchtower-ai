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

    // Step 1: Camera & Microphone Access
    setChecks(prev => ({ ...prev, camera: { status: 'checking', message: 'Requesting access...' } }));
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
      setChecks(prev => ({ ...prev, camera: { status: 'success', message: 'Camera connected' } }));
      setProgress(25);

      // Microphone check
      setChecks(prev => ({ ...prev, microphone: { status: 'success', message: 'Microphone connected' } }));
      setProgress(35);

      await aiDetector.initialize();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Environment Check - Use local AI detection
      setChecks(prev => ({ ...prev, lighting: { status: 'checking', message: 'Analyzing lighting...' } }));
      
      if (videoRef.current) {
        try {
          // Use local AI detection
          console.log('Starting local AI verification...');
          
          const lightingResult = await aiDetector.checkLighting(videoRef.current);
          setChecks(prev => ({ 
            ...prev, 
            lighting: { 
              status: lightingResult.isGood ? 'success' : 'error',
              message: lightingResult.isGood ? 'Good lighting' : 'Poor lighting'
            } 
          }));
          setProgress(60);

          if (!lightingResult.isGood) {
            toast.error("Poor lighting detected. Please improve lighting conditions.");
            return;
          }

          // Face detection
          setChecks(prev => ({ ...prev, face: { status: 'checking', message: 'Detecting face...' } }));
          
          const faceCount = await aiDetector.detectFaces(videoRef.current);
          setChecks(prev => ({ 
            ...prev, 
            face: { 
              status: faceCount === 1 ? 'success' : 'error',
              message: faceCount === 1 ? 'Face verified' : (faceCount === 0 ? 'No face detected' : 'Multiple faces detected')
            } 
          }));
          setProgress(85);

          if (faceCount !== 1) {
            toast.error(faceCount === 0 ? "No face detected. Please position yourself in front of the camera." : "Multiple faces detected. Only one person should be visible.");
            return;
          }

          console.log('Local verification completed successfully');
          
        } catch (error) {
          console.error('Verification error:', error);
          toast.error("Verification failed. Please try again.");
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setProgress(100);

      toast.success("Verification complete! Starting exam...");
      
      setTimeout(() => {
        navigate('/student/exam');
      }, 1500);

    } catch (error: any) {
      console.error('Verification error:', error);
      if (error.name === 'NotAllowedError') {
        setChecks(prev => ({ ...prev, camera: { status: 'error', message: 'Access denied' } }));
        toast.error("Please allow camera and microphone access");
      } else {
        toast.error("Verification failed: " + error.message);
      }
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
