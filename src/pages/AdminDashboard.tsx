import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Activity, Users, AlertTriangle, LogOut, Upload, RefreshCw, Download, FileText, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { pdfGenerator } from "@/utils/pdfGenerator";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [examSessions, setExamSessions] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    activeNow: 0,
    completed: 0,
    totalViolations: 0,
    avgViolationsPerStudent: 0,
    avgExamDuration: 0,
    totalStudents: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [studentsWithViolations, setStudentsWithViolations] = useState<any[]>([]);

  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem('adminAuth');
    if (!isAuthenticated) {
      toast.error("Please login as admin");
      navigate('/admin/login');
      return;
    }

    loadDashboardData();

    const violationSubscription = supabase
      .channel('violations-channel')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'violations' },
        (payload) => {
          console.log('New violation:', payload);
          toast.error('New violation detected!');
          loadDashboardData();
        }
      )
      .subscribe();

    const interval = setInterval(loadDashboardData, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(violationSubscription);
    };
  }, [navigate]);

  const loadDashboardData = async () => {
    try {
      const { data: examsData, error: examsError } = await supabase
        .from('exams')
        .select(`
          *,
          students (
            name,
            email,
            student_id
          ),
          exam_templates (
            subject_name,
            subject_code
          )
        `)
        .order('started_at', { ascending: false });

      if (examsError) throw examsError;

      const { data: violationsData } = await supabase
        .from('violations')
        .select(`
          *,
          exams (
            subject_code,
            exam_templates (
              subject_name,
              subject_code
            )
          )
        `)
        .order('timestamp', { ascending: false });

      setViolations(violationsData || []);

      // Calculate stats
      const activeCount = (examsData || []).filter(e => e.status === 'in_progress').length;
      const completedCount = (examsData || []).filter(e => e.status === 'completed').length;
      const totalViolations = violationsData?.length || 0;
      const totalStudents = new Set((examsData || []).map(e => e.student_id)).size;
      
      const avgViolations = totalStudents > 0 ? (totalViolations / totalStudents).toFixed(1) : 0;
      
      const completedExams = (examsData || []).filter(e => e.status === 'completed' && e.started_at && e.completed_at);
      const avgDuration = completedExams.length > 0
        ? Math.round(completedExams.reduce((sum, e) => {
            const start = new Date(e.started_at).getTime();
            const end = new Date(e.completed_at).getTime();
            return sum + (end - start) / 1000 / 60;
          }, 0) / completedExams.length)
        : 0;

      setStats({
        totalSessions: examsData?.length || 0,
        activeNow: activeCount,
        completed: completedCount,
        totalViolations,
        avgViolationsPerStudent: Number(avgViolations),
        avgExamDuration: avgDuration,
        totalStudents,
      });

      setExamSessions(examsData || []);
      prepareChartData(violationsData || []);
      groupViolationsByStudent(examsData || [], violationsData || []);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const prepareChartData = (violations: any[]) => {
    const hourlyData: { [key: string]: number } = {};
    
    violations.forEach(v => {
      const time = new Date(v.timestamp);
      const hourKey = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      hourlyData[hourKey] = (hourlyData[hourKey] || 0) + 1;
    });

    const data = Object.entries(hourlyData)
      .map(([time, count]) => ({ time, violations: count }))
      .slice(-10);

    setChartData(data);
  };

  const groupViolationsByStudent = (exams: any[], violations: any[]) => {
    const studentMap: { [key: string]: any } = {};

    exams.forEach(exam => {
      if (!exam.student_id || !exam.students) return;
      
      const studentViolations = violations.filter(v => v.student_id === exam.student_id);
      
      if (studentViolations.length > 0) {
        const violationTypes = [...new Set(studentViolations.map(v => v.violation_type))];
        
        studentMap[exam.student_id] = {
          name: exam.students.name,
          studentId: exam.students.student_id,
          id: exam.student_id,
          violationCount: studentViolations.length,
          violationTypes,
          violations: studentViolations,
          subjectName: exam.exam_templates?.subject_name || 'N/A',
          subjectCode: exam.exam_templates?.subject_code || exam.subject_code,
        };
      }
    });

    setStudentsWithViolations(Object.values(studentMap));
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    toast.success("Logged out");
    navigate('/');
  };

  const handleExportCSV = async (student: any) => {
    try {
      const csvContent = await pdfGenerator.exportToCSV(student.violations);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${student.name}_violations.csv`;
      a.click();
      toast.success("CSV exported");
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error("Failed to export CSV");
    }
  };

  const handleGenerateReport = async (student: any) => {
    try {
      toast.info("Generating PDF report...");
      const pdfUrl = await pdfGenerator.generateStudentReport(
        student.name,
        student.studentId,
        student.violations,
        student.subjectName,
        student.subjectCode
      );
      
      window.open(pdfUrl, '_blank');
      toast.success("Report generated and saved to Supabase");
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error("Failed to generate report");
    }
  };

  const handleExportAllCSV = async () => {
    try {
      const csvContent = await pdfGenerator.exportToCSV(violations);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_violations_${Date.now()}.csv`;
      a.click();
      toast.success("CSV exported");
    } catch (error) {
      toast.error("Failed to export");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Real-time Exam Monitoring</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDashboardData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAllCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/upload-template')}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Template
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sessions</p>
                  <p className="text-3xl font-bold">{stats.totalSessions}</p>
                </div>
                <Activity className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Now</p>
                  <p className="text-3xl font-bold text-success">{stats.activeNow}</p>
                </div>
                <Users className="w-8 h-8 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-3xl font-bold">{stats.completed}</p>
                </div>
                <Shield className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Violations</p>
                  <p className="text-3xl font-bold text-destructive">{stats.totalViolations}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div>
                <p className="text-sm text-muted-foreground">Avg Violations/Student</p>
                <p className="text-3xl font-bold text-warning">{stats.avgViolationsPerStudent}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div>
                <p className="text-sm text-muted-foreground">Avg Exam Duration</p>
                <p className="text-3xl font-bold">{stats.avgExamDuration} min</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-3xl font-bold text-primary">{stats.totalStudents}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Violations Over Time Chart */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-6">Violations Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="violations" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Violation Evidence Gallery */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                <h2 className="text-xl font-bold">Recent Violation Evidence Gallery</h2>
                <Badge variant="secondary">{violations.filter(v => v.image_url).length} Images</Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {violations
                .filter(v => v.image_url)
                .slice(0, 8)
                .map((violation) => (
                  <div key={violation.id} className="relative group">
                    <div className="aspect-video rounded-lg overflow-hidden border-2 border-border hover:border-destructive transition-colors">
                      <img 
                        src={violation.image_url} 
                        alt={violation.violation_type}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <Badge variant="destructive" className="text-xs">
                        {violation.violation_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(violation.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            {violations.filter(v => v.image_url).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No violation evidence images found
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Students with Violations */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Users className="w-5 h-5" />
                  <h2 className="text-xl font-bold">Students with Violations</h2>
                  <Badge variant="destructive">{studentsWithViolations.length} Students</Badge>
                </div>

                <div className="space-y-4">
                  {studentsWithViolations.map((student) => (
                    <div key={student.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold">{student.name}</h3>
                          <p className="text-sm text-muted-foreground">{student.studentId}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">Subject:</span> {student.subjectName} ({student.subjectCode})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                          <span className="font-bold text-destructive">{student.violationCount} Violations</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        {student.violationTypes.map((type: string) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {type.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleExportCSV(student)}>
                          <Download className="w-4 h-4 mr-1" />
                          CSV
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleGenerateReport(student)}>
                          <FileText className="w-4 h-4 mr-1" />
                          Report
                        </Button>
                      </div>
                    </div>
                  ))}

                  {studentsWithViolations.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No students with violations
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Violations List */}
            <Card className="mt-6">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-6">Recent Violations</h2>

                <div className="space-y-4">
                  {violations.slice(0, 5).map((violation) => (
                    <div key={violation.id} className="border rounded-lg p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle className="w-6 h-6 text-destructive" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold capitalize">
                              {violation.violation_type.replace(/_/g, ' ')}
                            </h4>
                            <Badge variant={violation.severity === 'high' ? 'destructive' : 'secondary'}>
                              {violation.severity}
                            </Badge>
                          </div>
                          {violation.exams?.exam_templates && (
                            <p className="text-xs text-muted-foreground mb-1">
                              <span className="font-medium">Subject:</span> {violation.exams.exam_templates.subject_name} ({violation.exams.exam_templates.subject_code})
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground mb-2">
                            {violation.details?.message || 'No details'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(violation.timestamp)}
                          </p>
                          
                          {violation.image_url && (
                            <div className="mt-3 aspect-video rounded-lg overflow-hidden border">
                              <img 
                                src={violation.image_url} 
                                alt={violation.violation_type}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = '/placeholder.svg';
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {violations.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No violations recorded
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Alerts */}
          <div>
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    <h3 className="font-bold">Live Alerts</h3>
                  </div>
                  <Badge variant="destructive">LIVE</Badge>
                </div>
                
                <div className="flex flex-col items-center justify-center py-12">
                  <Activity className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-center text-muted-foreground">
                    Monitoring for violations...
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Live alerts will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
