"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { XCircle, Loader2 } from "lucide-react";

interface ConversionProgressProps {
  status: string;
  stage: string;
  progress: number;
  onCancel?: () => void;
}

export function ConversionProgress({ status, stage, progress, onCancel }: ConversionProgressProps) {
  const isPending = ["queued", "downloading", "processing", "verifying"].includes(status);
  
  if (!isPending && status !== "failed") return null;

  return (
    <div className="space-y-4 p-4 bg-[#1a1e25] border border-white/10 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/80">
          {status !== "failed" && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
          <span className="text-sm font-medium">{stage}</span>
        </div>
        {status !== "failed" && progress > 0 && (
          <span className="text-xs font-mono text-cyan-400">{Math.round(progress)}%</span>
        )}
      </div>
      
      {status !== "failed" ? (
        <Progress value={progress} className="h-2 bg-white/10" />
      ) : (
        <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded border border-red-400/20">
          Ha ocurrido un error durante el proceso.
        </div>
      )}

      {onCancel && status !== "failed" && (
        <div className="flex justify-end">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onCancel}
            className="text-white/40 hover:text-red-400 hover:bg-red-400/10 h-8 gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
