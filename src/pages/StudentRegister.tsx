import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
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
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      // Generate subject code
      const { data: codeData, error: codeError } = await supabase.rpc('generate_subject_code');
      
      if (codeError) throw codeError;
      
      const subjectCode = codeData;

      // Insert student
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

      // Create exam session
      const { error: examError } = await supabase
        .from('exams')
        .insert({
          student_id: studentData.id,
          subject_code: subjectCode,
          status: 'not_started',
        });

      if (examError) throw examError;

      toast.success(`Registration successful! Your Subject Code: ${subjectCode}`, {
        duration: 5000,
      });

      // Store in session for next steps
      sessionStorage.setItem('studentData', JSON.stringify({
        id: studentData.id,
        name: studentData.name,
        subjectCode: subjectCode,
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

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Registering..." : "Register & Get Exam Code"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Your subject code will be auto-generated and displayed after registration
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
                You'll receive a unique exam code
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
