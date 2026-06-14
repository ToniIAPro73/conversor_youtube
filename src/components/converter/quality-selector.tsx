"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface QualitySelectorProps {
  format: "mp3" | "mp4";
  quality: string;
  onQualityChange: (quality: string) => void;
  availableHeights: number[];
}

export function QualitySelector({ format, quality, onQualityChange, availableHeights }: QualitySelectorProps) {
  const mp3Qualities = ["128", "192", "256", "320"];
  const mp4Qualities = ["360", "480", "720", "1080"].filter(h => 
    availableHeights.some(ah => ah >= parseInt(h)) || parseInt(h) === 360
  );

  const currentQualities = format === "mp3" ? mp3Qualities : mp4Qualities;

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-white/70 ml-1">Selecciona la calidad</label>
      <Tabs 
        value={quality} 
        onValueChange={onQualityChange} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4 h-[68px] bg-white/[0.03] border border-white/10 p-1.5 rounded-2xl backdrop-blur-sm">
          {currentQualities.map((q) => (
            <TabsTrigger 
              key={q}
              value={q} 
              className="text-sm font-bold text-white/40 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-[0_0_20px_rgba(255,255,255,0.15)] rounded-xl transition-all duration-300 h-full flex flex-col items-center justify-center gap-0.5"
            >
              <span>{q}</span>
              <span className="text-[9px] opacity-60 uppercase tracking-wider">{format === "mp3" ? "kbps" : "p"}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-[10px] text-white/30 italic ml-1 px-1">
        {format === "mp3" 
          ? "La conversión no puede mejorar la calidad del audio original."
          : "Se utilizará la mejor alternativa compatible si la resolución exacta no está disponible."}
      </p>
    </div>
  );
}
