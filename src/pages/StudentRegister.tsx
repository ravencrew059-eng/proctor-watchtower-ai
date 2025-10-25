import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ArrowLeft, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const StudentRegister = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subjectCode: "",
  });
  const [faceCapture, setFaceCapture] = useState(false);
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [faceImageUrl, setFaceImageUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startFaceCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Explicitly play the video to ensure it starts
        try {
          await videoRef.current.play();
          console.log('Video started playing');
        } catch (playError) {
          console.error('Error playing video:', playError);
        }
      }
      
      streamRef.current = stream;
      setFaceCapture(true);
    } catch (error) {
      console.error('Camera error:', error);
      toast.error("Camera access required for face registration");
    }
  };

  const captureFaceImage = () => {
    if (!videoRef.current) {
      toast.error("Video not ready");
      return;
    }

    // Check if video has valid dimensions
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      toast.error("Please wait for camera to initialize");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      toast.error("Failed to capture image");
      return;
    }
    
    ctx.drawImage(videoRef.current, 0, 0);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    setFaceImageUrl(imageDataUrl);
    setFaceCaptured(true);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    setFaceCapture(false);
    toast.success("Face captured successfully!");
  };

  const retakeFaceImage = () => {
    setFaceCaptured(false);
    setFaceImageUrl("");
    startFaceCapture();
  };

  const uploadFaceImage = async (studentId: string, studentName: string): Promise<string> => {
    try {
      const response = await fetch(faceImageUrl);
      const blob = await response.blob();
      
      const fileName = `${studentId}/${studentName.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      
      const { data, error } = await supabase.storage
        .from('face-registrations')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('face-registrations')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading face image:', error);
      throw error;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim() || !formData.subjectCode.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!faceCaptured) {
      toast.error("Please capture your face image for registration");
      return;
    }

    setLoading(true);

    try {
      // Validate subject code exists
      const { data: templateData, error: templateError } = await supabase
        .from('exam_templates')
        .select('id, subject_name, subject_code')
        .eq('subject_code', formData.subjectCode.trim().toUpperCase())
        .single();

      if (templateError || !templateData) {
        toast.error("Invalid subject code. Please check with your administrator.");
        setLoading(false);
        return;
      }

      const subjectCode = formData.subjectCode.trim().toUpperCase();

      // Insert student (without face_image_url first)
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject_code: subjectCode,
        })
        .select()
        .single();

      if (studentError) throw studentError;

      // Upload face image
      const faceUrl = await uploadFaceImage(studentData.id, studentData.name);
      
      // Update student with face image URL
      await supabase
        .from('students')
        .update({ face_image_url: faceUrl })
        .eq('id', studentData.id);

      // Create exam session
      const { error: examError } = await supabase
        .from('exams')
        .insert({
          student_id: studentData.id,
          subject_code: subjectCode,
          exam_template_id: templateData.id,
          status: 'not_started',
        });

      if (examError) throw examError;

      toast.success(`Registration successful for ${templateData.subject_name}!`, {
        duration: 5000,
      });

      // Store in session for next steps
      sessionStorage.setItem('studentData', JSON.stringify({
        id: studentData.id,
        name: studentData.name,
        subjectCode: subjectCode,
        subjectName: templateData.subject_name,
      }));

      setTimeout(() => {
        navigate('/student/verify');
      }, 1500);

    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">ExamEye Shield</h1>
              <p className="text-sm text-muted-foreground">Student Registration</p>
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <Card>
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Student Registration</h2>
              <p className="text-sm text-muted-foreground">
                Enter your details to receive your unique exam code
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subjectCode">Subject Code</Label>
                <Input
                  id="subjectCode"
                  placeholder="Enter subject code (e.g., ETCS214A)"
                  value={formData.subjectCode}
                  onChange={(e) => setFormData({ ...formData, subjectCode: e.target.value.toUpperCase() })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter the subject code provided by your administrator
                </p>
              </div>

              {/* Face Registration */}
              <div className="space-y-2">
                <Label>Face Registration</Label>
                {!faceCapture && !faceCaptured && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full" 
                    onClick={startFaceCapture}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Capture Face
                  </Button>
                )}
                
                {faceCapture && (
                  <div className="space-y-2">
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden border-2 border-primary">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline
                        muted 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button 
                      type="button" 
                      className="w-full" 
                      onClick={captureFaceImage}
                    >
                      Take Photo
                    </Button>
                  </div>
                )}
                
                {faceCaptured && faceImageUrl && (
                  <div className="space-y-2">
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                      <img 
                        src={faceImageUrl} 
                        alt="Captured face" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full" 
                      onClick={retakeFaceImage}
                    >
                      Retake Photo
                    </Button>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading || !faceCaptured}>
                {loading ? "Registering..." : "Register & Get Exam Code"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Make sure you have the correct subject code before registering
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="mt-6 bg-muted/50">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3">What happens next?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                Enter the subject code provided by your administrator
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                Environment checks will verify your setup
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                Your webcam will monitor during the exam
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentRegister;
