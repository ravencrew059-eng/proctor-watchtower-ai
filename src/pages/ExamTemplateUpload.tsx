import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Upload, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';

const ExamTemplateUpload = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
      } else {
        toast.error("Please select an Excel file (.xlsx or .xls)");
      }
    }
  };

  const parseExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (!file) {
      toast.error("Please select an Excel file");
      return;
    }

    setLoading(true);

    try {
      // Parse Excel file
      const questions = await parseExcelFile(file);
      
      if (questions.length === 0) {
        toast.error("No questions found in the Excel file");
        setLoading(false);
        return;
      }

      // Create exam template
      const { data: templateData, error: templateError } = await supabase
        .from('exam_templates')
        .insert({
          template_name: templateName.trim(),
          total_questions: questions.length,
          created_by: 'admin'
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Insert questions
      const questionInserts = questions.map((q: any, index: number) => {
        const questionType = q.type?.toLowerCase() || 'short_answer';
        
        return {
          exam_template_id: templateData.id,
          question_number: index + 1,
          question_text: q.question || q.Question || q.text || '',
          question_type: questionType,
          options: questionType === 'mcq' ? {
            a: q.option_a || q.OptionA || '',
            b: q.option_b || q.OptionB || '',
            c: q.option_c || q.OptionC || '',
            d: q.option_d || q.OptionD || ''
          } : null,
          correct_answer: q.correct_answer || q.CorrectAnswer || null,
          points: q.points || 1
        };
      });

      const { error: questionsError } = await supabase
        .from('exam_questions')
        .insert(questionInserts);

      if (questionsError) throw questionsError;

      toast.success(`Template "${templateName}" uploaded with ${questions.length} questions!`);
      
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 1500);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Failed to upload template");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/dashboard')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">ExamEye Shield</h1>
              <p className="text-sm text-muted-foreground">Upload Exam Template</p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Upload Exam Template</h2>
              <p className="text-sm text-muted-foreground">
                Upload an Excel file with exam questions (MCQ or Short Answer)
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="templateName">Template Name</Label>
                <Input
                  id="templateName"
                  placeholder="e.g., Final Exam - Spring 2024"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Excel File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    required
                  />
                  <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                </div>
                {file && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {file.name}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                <Upload className="w-4 h-4 mr-2" />
                {loading ? "Uploading..." : "Upload Template"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6 bg-muted/50">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3">Excel Format Guidelines</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                Column headers: question, type (mcq/short_answer), option_a, option_b, option_c, option_d, correct_answer, points
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                For MCQ: type = "mcq", fill options a-d, specify correct_answer (a/b/c/d)
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                For Short Answer: type = "short_answer", question text only
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
                Default points per question: 1 (can be customized)
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExamTemplateUpload;