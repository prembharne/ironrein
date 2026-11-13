"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const LogosGrid: React.FC = () => {
  return (
    <div className="logos" aria-label="Built with">
      {/* 1. OCEANEX: two wavy strokes (stroke 2.4) */}
      <div className="logo-cell fade-up" style={{ ['--d' as string]: '1.25s' }}>
        <div className="logo-mark">
          <svg width="22" height="20" viewBox="0 0 22 20" fill="none" aria-hidden="true">
            <path d="M2 7c3-3 6-3 9 0s6 3 9 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M2 13c3-3 6-3 9 0s6 3 9 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span>NEAR</span>
        </div>
      </div>

      {/* 2. Nordhavn: Georgia bold italic 15px, letter-spacing .02em, no icon */}
      <div className="logo-cell fade-up" style={{ ['--d' as string]: '1.32s' }}>
        <span className="logo-nordhavn">NEAR AI</span>
      </div>

      {/* 3. BLUEGATE: three solid bars of heights 10/15/12 */}
      <div className="logo-cell fade-up" style={{ ['--d' as string]: '1.39s' }}>
        <div className="logo-mark">
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
            <rect x="1" y="7" width="3.5" height="10" rx="1" fill="currentColor" />
            <rect x="7" y="2" width="3.5" height="15" rx="1" fill="currentColor" />
            <rect x="13" y="5" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
          <span>ML-DSA-65</span>
        </div>
      </div>

      {/* 4. KELPWAY: outlined triangle, text 11px weight 500 letter-spacing .32em */}
      <div className="logo-cell fade-up" style={{ ['--d' as string]: '1.46s' }}>
        <div className="logo-mark">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <polygon points="10,2 18,17 2,17" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="logo-kelpway">TEE</span>
        </div>
      </div>

      {/* 5. TIDELINE: text only, 16px weight 800, letter-spacing −.02em, inside a 2px border with radius 4px and padding 2px 7px */}
      <div className="logo-cell row-2 fade-up" style={{ ['--d' as string]: '1.42s' }}>
        <span className="logo-tideline">ED25519</span>
      </div>

      {/* 6. HARBORIX: "H" made of 3px strokes */}
      <div className="logo-cell row-2 fade-up" style={{ ['--d' as string]: '1.49s' }}>
        <div className="logo-mark">
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
            <path d="M3 3v14M15 3v14M3 10h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>RUST</span>
        </div>
      </div>

      {/* 7. seaflux: lowercase 15px weight 500, ring plus centre dot */}
      <div className="logo-cell row-2 fade-up" style={{ ['--d' as string]: '1.56s' }}>
        <div className="logo-mark">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="10" r="2.2" fill="currentColor" />
          </svg>
          <span className="logo-seaflux">nextjs</span>
        </div>
      </div>

      {/* 8. PORTERRA: filled mountain silhouette, 11px letter-spacing .24em */}
      <div className="logo-cell row-2 fade-up" style={{ ['--d' as string]: '1.63s' }}>
        <div className="logo-mark">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <polygon points="10,4 18,17 2,17" fill="currentColor" />
          </svg>
          <span className="logo-porterra">SHA-256</span>
        </div>
      </div>
    </div>
  );
};
