import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface ViolationData {
  id: string;
  violation_type: string;
  severity: string;
  timestamp: string;
  image_url?: string;
  details?: any;
}

export class PDFGenerator {
  async generateStudentReport(
    studentName: string,
    studentId: string,
    violations: ViolationData[]
  ): Promise<string> {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    // Header
    pdf.setFontSize(20);
    pdf.setTextColor(220, 38, 38);
    pdf.text('Student Violation Report', pageWidth / 2, 20, { align: 'center' });
    
    // Student Info
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Student ID: ${studentId}`, 20, 40);
    pdf.text(`Student Name: ${studentName}`, 20, 48);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 56);
    
    // Separator
    pdf.setLineWidth(0.5);
    pdf.setDrawColor(220, 38, 38);
    pdf.line(20, 62, pageWidth - 20, 62);
    
    // Summary Section
    pdf.setFontSize(16);
    pdf.text('Summary', 20, 75);
    
    pdf.setFontSize(12);
    pdf.text(`Total Violations: ${violations.length}`, 20, 85);
    pdf.text(`Report Generated: ${new Date().toLocaleString()}`, 20, 93);
    
    // Violation Breakdown
    pdf.setFontSize(14);
    pdf.text('Violation Breakdown', 20, 110);
    
    // Count violations by type
    const violationCounts: { [key: string]: number } = {};
    violations.forEach(v => {
      const type = v.violation_type;
      violationCounts[type] = (violationCounts[type] || 0) + 1;
    });
    
    // Table Header
    pdf.setFontSize(11);
    pdf.setFillColor(220, 38, 38);
    pdf.rect(20, 118, pageWidth - 40, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('Violation Type', 25, 123);
    pdf.text('Count', pageWidth / 2, 123);
    pdf.text('Percentage', pageWidth - 60, 123);
    
    // Table Rows
    pdf.setTextColor(0, 0, 0);
    let yPos = 133;
    Object.entries(violationCounts).forEach(([type, count], index) => {
      const percentage = ((count / violations.length) * 100).toFixed(1);
      
      if (index % 2 === 0) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(20, yPos - 5, pageWidth - 40, 8, 'F');
      }
      
      pdf.text(type.replace(/_/g, ' '), 25, yPos);
      pdf.text(count.toString(), pageWidth / 2, yPos);
      pdf.text(`${percentage}%`, pageWidth - 60, yPos);
      
      yPos += 10;
    });
    
    // Detailed Violations (if space allows, otherwise new page)
    if (yPos > 200) {
      pdf.addPage();
      yPos = 20;
    } else {
      yPos += 10;
    }
    
    pdf.setFontSize(14);
    pdf.text('Detailed Violations', 20, yPos);
    yPos += 10;
    
    violations.slice(0, 10).forEach((violation, index) => {
      if (yPos > 270) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${index + 1}. ${violation.violation_type.replace(/_/g, ' ')}`, 25, yPos);
      pdf.text(new Date(violation.timestamp).toLocaleString(), 25, yPos + 6);
      pdf.text(`Severity: ${violation.severity}`, 25, yPos + 12);
      
      yPos += 22;
    });
    
    // Generate PDF blob
    const pdfBlob = pdf.output('blob');
    
    // Upload to Supabase Storage
    const fileName = `${studentName.replace(/\s+/g, '_')}/reports/violation_report_${Date.now()}.pdf`;
    
    const { data, error } = await supabase.storage
      .from('violation-evidence')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('violation-evidence')
      .getPublicUrl(fileName);

    return publicUrl;
  }

  async exportToCSV(violations: ViolationData[]): Promise<string> {
    const headers = ['Timestamp', 'Violation Type', 'Severity', 'Details'];
    const rows = violations.map(v => [
      new Date(v.timestamp).toLocaleString(),
      v.violation_type.replace(/_/g, ' '),
      v.severity,
      v.details?.message || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }
}

export const pdfGenerator = new PDFGenerator();
