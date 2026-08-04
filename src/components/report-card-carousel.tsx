"use client";

import Image from "next/image";
import {
  type PointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { TrailingArrow } from "@/components/ui/button";
import type { ReportCardItem } from "@/content/resources";

export function ReportCardCarousel({
  items,
  stage,
}: {
  items: ReportCardItem[];
  stage: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [turns, setTurns] = useState(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);

  const updatePosition = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  }, []);

  const handleArrowClick = () => {
    const track = trackRef.current;
    if (!track) return;

    setTurns((current) => current + 1);
    if (atEnd) {
      track.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      track.scrollBy({ left: track.clientWidth * 0.52, behavior: "smooth" });
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;

    isDragging.current = true;
    dragStartX.current = event.clientX;
    dragStartScrollLeft.current = track.scrollLeft;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const track = trackRef.current;
    if (!track) return;

    track.scrollLeft =
      dragStartScrollLeft.current - (event.clientX - dragStartX.current);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 text-sm font-semibold text-accent">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-[1px] bg-signal"
        />
        <span>{stage}</span>
        <span aria-hidden="true" className="rule-ticks h-px min-w-8 flex-1" />
        <button
          type="button"
          aria-label={atEnd ? "Show first insights" : "Show more insights"}
          onClick={handleArrowClick}
          className="hidden size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-accent transition-[background-color,border-color] hover:border-accent hover:bg-accent-soft lg:flex"
        >
          <span
            className="flex transition-transform duration-500 [transition-timing-function:var(--ease-out-quart)]"
            style={{ transform: `rotate(${turns * 180}deg)` }}
          >
            <TrailingArrow className="size-4" />
          </span>
        </button>
      </div>

      <div
        ref={trackRef}
        data-carousel-track={stage.toLowerCase()}
        onScroll={updatePosition}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="grid gap-8 sm:grid-cols-2 lg:flex lg:cursor-grab lg:snap-x lg:snap-mandatory lg:overflow-x-auto lg:[scrollbar-width:none] lg:[touch-action:pan-y] lg:active:cursor-grabbing lg:[&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <div
            key={item.title}
            className="flex flex-col gap-4 border-t border-line pt-4 lg:w-[calc((100%-6rem)/4)] lg:flex-none lg:snap-start"
          >
            <Image
              src="/resource-placeholder.svg"
              alt=""
              width={640}
              height={360}
              draggable={false}
              className="mt-1 aspect-video w-full rounded-md object-cover"
            />
            <h3 className="clamp-3 text-base font-semibold">{item.title}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
