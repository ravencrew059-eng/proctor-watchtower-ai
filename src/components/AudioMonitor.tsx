import { Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface AudioMonitorProps {
  audioLevel: number;
  threshold?: number;
}

export const AudioMonitor = ({ audioLevel, threshold = 30 }: AudioMonitorProps) => {
  const percentage = Math.min(Math.round(audioLevel), 100);
  const isLoud = percentage > threshold;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mic className={`w-4 h-4 ${isLoud ? 'text-destructive' : 'text-primary'}`} />
          <h3 className="font-semibold">Audio Monitor</h3>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Audio Level</span>
            <span className="font-bold">{percentage}%</span>
          </div>
          
          <Progress 
            value={percentage} 
            className={`h-2 ${isLoud ? '[&>div]:bg-destructive' : ''}`}
          />
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Quiet</span>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>⚠️ Threshold: {threshold}%</span>
            </div>
            <span className="text-muted-foreground">Loud</span>
          </div>

          <div className="flex items-center gap-2 text-xs mt-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-muted-foreground">Status: Monitoring</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
