"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { AtmosphereCanvas } from "./AtmosphereCanvas";
import { Navbar } from "./Navbar";
import { HeroSection } from "./HeroSection";
import { StatementSection } from "./StatementSection";
import { MessagingScrollBackground } from "./MessagingScrollBackground";
import { computeSlidesMotion, SlideState } from "@/lib/glowMath";
import { yoctoToNear } from "@ironrein/shared";
import { NETWORK } from "@/lib/config";
import { useLiveVault } from "./useLiveVault";
import "./landing.css";

export function LandingApp({ fontClassName = "" }: { fontClassName?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [navOn, setNavOn] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const vault = useLiveVault();
  const trust = vault.status
    ? `Live on NEAR ${NETWORK}: ${vault.status.accepted_count} paid, ${vault.status.rejected_count} blocked, ${yoctoToNear(vault.status.balance)} NEAR guarded${vault.status.paused ? " (paused)" : ""}`
    : vault.error
      ? `Can't reach the vault right now (${vault.error})`
      : `Reading the vault on NEAR ${NETWORK}…`;
  const [slides, setSlides] = useState<SlideState[]>(() => computeSlidesMotion(0).slides);

  useEffect(() => {
    const root = rootRef.current;
    // First animation frame: enable the CSS fade-ups (scoped to .landing, not <body>).
    const raf = requestAnimationFrame(() => root?.classList.add("ready"));

    const updateScrollState = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      const innerHeight = window.innerHeight || 1;
      const q = y / innerHeight;

      setScrollY(y);
      const motion = computeSlidesMotion(q, 5);
      setSlides(motion.slides);
      setNavOn(motion.navOn);
    };

    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState, { passive: true });
    updateScrollState();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      root?.classList.remove("ready");
    };
  }, []);

  return (
    <div ref={rootRef} className={`landing ${fontClassName}`}>
      <AtmosphereCanvas />
      <MessagingScrollBackground scrollY={scrollY} activity={vault.recent} txHashes={vault.txHashes} />
      <Navbar isOn={navOn} />
      <main>
        <HeroSection trust={trust} />
        <StatementSection slides={slides} policy={vault.policy} />
      </main>
    </div>
  );
}
