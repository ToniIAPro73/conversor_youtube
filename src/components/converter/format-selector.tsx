"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Music, Video } from "lucide-react";

interface FormatSelectorProps {
  format: "mp3" | "mp4";
  onFormatChange: (format: "mp3" | "mp4") => void;
}

export function FormatSelector({ format, onFormatChange }: FormatSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-white/70 ml-1">Selecciona el formato</label>
      <Tabs 
        value={format} 
        onValueChange={(v) => onFormatChange(v as "mp3" | "mp4")} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 h-[68px] bg-white/[0.03] border border-white/10 p-1.5 rounded-2xl backdrop-blur-sm">
          <TabsTrigger 
            value="mp3" 
            className="flex items-center justify-center gap-3 text-white/40 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-[0_0_20px_rgba(255,255,255,0.15)] rounded-xl transition-all duration-300 h-full group"
          >
            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center group-data-[state=active]:bg-black/5 transition-colors">
              <Music className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold tracking-tight">MP3</div>
              <div className="text-[10px] opacity-60 font-medium">Solo audio</div>
            </div>
          </TabsTrigger>
          <TabsTrigger 
            value="mp4" 
            className="flex items-center justify-center gap-3 text-white/40 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-[0_0_20px_rgba(255,255,255,0.15)] rounded-xl transition-all duration-300 h-full group"
          >
            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center group-data-[state=active]:bg-black/5 transition-colors">
              <Video className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold tracking-tight">MP4</div>
              <div className="text-[10px] opacity-60 font-medium">Vídeo</div>
            </div>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
