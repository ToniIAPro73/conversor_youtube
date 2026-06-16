"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileAudio, FileVideo, RefreshCw } from "lucide-react";

interface DownloadCardProps {
  fileName: string;
  format: "mp3" | "mp4";
  quality: string;
  sizeBytes: number;
  downloadUrl: string;
  onReset: () => void;
}

export function DownloadCard({ fileName, format, quality, sizeBytes, downloadUrl, onReset }: DownloadCardProps) {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Card className="bg-[#1a1e25] border-emerald-500/20 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            {format === "mp3" ? (
              <FileAudio className="h-6 w-6 text-emerald-400" />
            ) : (
              <FileVideo className="h-6 w-6 text-emerald-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-white font-medium truncate" title={fileName}>
              {fileName}
            </h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-white/50">
              <span>{format.toUpperCase()}</span>
              <span>{quality}</span>
              <span>{formatSize(sizeBytes)}</span>
            </div>
          </div>
        </div>
        
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button 
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-11"
            onClick={() => {
              const link = document.createElement("a");
              link.href = downloadUrl;
              link.download = fileName;
              link.click();
            }}
          >
            <Download className="h-4 w-4" />
            Descargar {format.toUpperCase()}
          </Button>
          <Button 
            variant="outline"
            onClick={onReset}
            className="w-full border-white/10 bg-transparent hover:bg-white/5 text-white/80 gap-2 h-11"
          >
            <RefreshCw className="h-4 w-4" />
            Convertir otro
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
