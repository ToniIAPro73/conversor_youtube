"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, CheckCircle2 } from "lucide-react";
import { MetadataResponse } from "@/lib/youtube/schemas";

interface MediaPreviewProps {
  metadata: MetadataResponse;
  onReset: () => void;
}

export function MediaPreview({ metadata, onReset }: MediaPreviewProps) {
  return (
    <Card className="bg-[#1a1e25] border-white/10 overflow-hidden">
      <CardContent className="p-0 sm:flex">
        <div className="relative w-full sm:w-48 aspect-video sm:aspect-square flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={metadata.thumbnailUrl}
            alt={metadata.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="p-4 flex flex-col justify-between flex-1">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-white font-medium line-clamp-2" title={metadata.title}>
                {metadata.title}
              </h3>
              <button 
                onClick={onReset}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
              >
                Cambiar enlace
              </button>
            </div>
            <div className="mt-2 space-y-1 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                <span className="truncate">{metadata.channel}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                <span>{metadata.durationLabel}</span>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1 w-fit">
              <CheckCircle2 className="h-3 w-3" />
              Compatible
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
