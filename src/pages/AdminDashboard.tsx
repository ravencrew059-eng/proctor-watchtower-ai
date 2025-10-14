import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Activity, Users, AlertTriangle, LogOut, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [examSessions, setExamSessions] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [stats, setStats] = useState({
    activeExams: 0,
    totalStudents: 0,
    totalViolations: 0,
  });

  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem('adminAuth');
    if (!isAuthenticated) {
      toast.error("Please login as admin");
      navigate('/admin/login');
      return;
    }

    loadDashboardData();

    // Poll for updates every 5 seconds
    const interval = setInterval(loadDashboardData, 5000);
    return () => clearInterval(interval);
  }, [navigate]);

  const loadDashboardData = async () => {
    try {
      // Load exams with student details
      const { data: examsData, error: examsError } = await supabase
        .from('exams')
        .select(`
          *,
          students (
            name,
            email
          )
        `)
        .order('started_at', { ascending: false });

      if (examsError) throw examsError;

      // Load violations count for each exam
      const examsWithViolations = await Promise.all(
        (examsData || []).map(async (exam) => {
          const { count } = await supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id);

          return {
            ...exam,
            violationCount: count || 0,
          };
        })
      );

      setExamSessions(examsWithViolations);

      // Calculate stats
      const activeCount = examsWithViolations.filter(e => e.status === 'in_progress').length;
      const totalViolations = examsWithViolations.reduce((sum, e) => sum + e.violationCount, 0);

      setStats({
        activeExams: activeCount,
        totalStudents: examsWithViolations.length,
        totalViolations: totalViolations,
      });

      // Load all violations
      const { data: violationsData } = await supabase
        .from('violations')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      setViolations(violationsData || []);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    toast.success("Logged out successfully");
    navigate('/');
  };

  const getStatusBadge = (status: string) => {
    if (status === 'in_progress') {
      return <Badge className="bg-primary">In Progress</Badge>;
    }
    if (status === 'completed') {
      return <Badge variant="secondary">Completed</Badge>;
    }
    return <Badge variant="outline">Not Started</Badge>;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const generatePDF = async (examId: string) => {
    toast.info("PDF generation feature will be implemented with a PDF library");
    // In production, implement PDF generation here
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">ExamEye Shield</h1>
              <p className="text-sm text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Exams</p>
                  <p className="text-3xl font-bold">{stats.activeExams}</p>
                  <p className="text-xs text-muted-foreground">Currently in progress</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Students</p>
                  <p className="text-3xl font-bold">{stats.totalStudents}</p>
                  <p className="text-xs text-muted-foreground">Registered students</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Violations</p>
                  <p className="text-3xl font-bold">{stats.totalViolations}</p>
                  <p className="text-xs text-muted-foreground">Across all exams</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="exams" className="space-y-6">
          <TabsList>
            <TabsTrigger value="exams">Exams</TabsTrigger>
            <TabsTrigger value="violations">Violations</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="exams">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Exam Sessions</h2>
                    <p className="text-sm text-muted-foreground">Monitor all exam sessions and their status</p>
                  </div>
                  <Button variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold">Student</th>
                        <th className="text-left py-3 px-4 font-semibold">Subject Code</th>
                        <th className="text-left py-3 px-4 font-semibold">Status</th>
                        <th className="text-left py-3 px-4 font-semibold">Started</th>
                        <th className="text-center py-3 px-4 font-semibold">Violations</th>
                        <th className="text-center py-3 px-4 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examSessions.map((session) => (
                        <tr key={session.id} className="border-b hover:bg-muted/50">
                          <td className="py-4 px-4">{session.students?.name || 'Unknown'}</td>
                          <td className="py-4 px-4">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {session.subject_code}
                            </code>
                          </td>
                          <td className="py-4 px-4">{getStatusBadge(session.status)}</td>
                          <td className="py-4 px-4 text-sm text-muted-foreground">
                            {formatDate(session.started_at)}
                          </td>
                          <td className="py-4 px-4 text-center">
                            {session.violationCount > 0 ? (
                              <Badge variant="destructive" className="rounded-full">
                                {session.violationCount}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="rounded-full">0</Badge>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => generatePDF(session.id)}
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {examSessions.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No exam sessions found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="violations">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-6">Violation Log</h2>

                <div className="space-y-3">
                  {violations.map((violation) => (
                    <div key={violation.id} className="flex items-start gap-4 p-4 rounded-lg border">
                      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold capitalize">
                            {violation.violation_type.replace('_', ' ')}
                          </h4>
                          <Badge variant={violation.severity === 'high' ? 'destructive' : 'outline'}>
                            {violation.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {violation.details?.message || 'No details'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(violation.timestamp)}
                        </p>
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
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-4">Analytics Dashboard</h2>
                <p className="text-muted-foreground text-center py-12">
                  Visual analytics charts will be implemented here using recharts library
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
