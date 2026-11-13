"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Link from 'next/link';
import { Button } from './Button';

interface NavbarProps {
  isOn: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isOn }) => {
  return (
    <header className={`nav ${isOn ? 'on' : ''}`} id="nav" role="banner">
      {/* Brand */}
      <a href="#" className="nav-brand" aria-label="Leash home">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          <circle cx="11" cy="11" r="11" fill="url(#brand-grad)" />
          <path
            d="M5 10.2c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M5 14.2c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="brand-name">Leash</span>
      </a>

      {/* Nav Links */}
      <nav className="nav-links" aria-label="Main Navigation">
        <Link href="/activity">Activity</Link>
        <Link href="/policy">Policy</Link>
        <Link href="/redteam">Red Team</Link>
        <Link href="/setup">Setup</Link>
        <Link href="/kill">Kill switch</Link>
      </nav>

      {/* Right */}
      <div className="nav-right">
        <Link href="/activity" className="login-link">
          Console
        </Link>
        <div className="navcta" aria-hidden={!isOn}>
          <Button label="Red Team" href="/redteam" labelClassName="lbl" />
        </div>
      </div>
    </header>
  );
};
