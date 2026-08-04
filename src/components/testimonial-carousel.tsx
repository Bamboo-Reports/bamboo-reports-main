"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const testimonials = [
  { name: "Abhishek Gupta", image: "re-abhishek.png" },
  { name: "Sanjiv Jain", image: "re-sanjiv-jain.png" },
  { name: "Akshay Matkar", image: "re-akshay-matkar.png" },
  { name: "Avnish Anand", image: "re-avnish.png" },
  { name: "Diptarup Chakraborti", image: "re-diptarup.png" },
  { name: "Dr Karthik Anantharaman", image: "re-karthik.png" },
  { name: "Gaurav Suri", image: "re-gaurav-suri.png" },
  { name: "Hansween Kaur", image: "re-hansween.png" },
  { name: "Madhav Vemuri", image: "re-madhav.png" },
  { name: "Manish Kumar", image: "re-manish-kumar.png" },
  { name: "Meera Iyer", image: "re-meera-iyer.png" },
  { name: "Nimish Thaker", image: "re-nimish.png" },
  { name: "Prasad Pimple", image: "re-prasad.png" },
  { name: "Ramesh Mani", image: "re-ramesh.png" },
  { name: "Suman Tewary", image: "re-suman.png" },
  { name: "Varun Kaushik", image: "re-varun-kaushik.png" },
] as const;

export function TestimonialCarousel() {
  const [active, setActive] = useState(8);
  const pointerStart = useRef<number | null>(null);

  const show = (index: number) => {
    setActive((index + testimonials.length) % testimonials.length);
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % testimonials.length);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Report contributor perspectives"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") show(active - 1);
        if (event.key === "ArrowRight") show(active + 1);
      }}
      className="mx-auto w-full max-w-[90rem] px-5 outline-none sm:px-12"
    >
      <div className="relative">
        <div
          onPointerDown={(event) => {
            pointerStart.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (pointerStart.current === null) return;
            const distance = event.clientX - pointerStart.current;
            pointerStart.current = null;
            if (Math.abs(distance) < 45) return;
            show(distance > 0 ? active - 1 : active + 1);
          }}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          className="touch-pan-y overflow-hidden"
        >
          <div
            className="flex transition-transform duration-700 [transition-timing-function:var(--ease-out-quart)] motion-reduce:transition-none"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {testimonials.map((testimonial, index) => (
              <figure
                key={testimonial.name}
                aria-hidden={active !== index}
                className="relative aspect-[2048/809] w-full flex-none"
              >
                <Image
                  src={`/testimonials/implementers-guide/${testimonial.image}`}
                  alt={`Testimonial from ${testimonial.name}`}
                  fill
                  draggable={false}
                  priority={index === 8}
                  className="select-none object-contain"
                  sizes="(max-width: 1536px) calc(100vw - 2.5rem), 1440px"
                />
              </figure>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => show(active - 1)}
          aria-label="Show previous perspective"
          className="absolute -left-3 top-1/2 z-30 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-3xl text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:-left-5 sm:size-12"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          onClick={() => show(active + 1)}
          aria-label="Show next perspective"
          className="absolute -right-3 top-1/2 z-30 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-3xl text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:-right-5 sm:size-12"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div
        className="mt-5 flex flex-wrap justify-center gap-2"
        aria-label="Choose a perspective"
      >
        {testimonials.map((testimonial, index) => (
          <button
            key={testimonial.name}
            type="button"
            onClick={() => show(index)}
            aria-label={`Show perspective ${index + 1} of ${testimonials.length}`}
            aria-current={active === index ? "true" : undefined}
            className={`size-2.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active === index
                ? "bg-accent"
                : "bg-line-strong hover:bg-ink-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
