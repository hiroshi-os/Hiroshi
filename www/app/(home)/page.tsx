"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelThemeSwitcher } from "../../components/ThemeSwitcher";

export default function HomePage() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-800 dark:text-zinc-300 flex flex-col font-mono selection:bg-emerald-500/20 selection:text-emerald-300 transition-colors duration-200">
      
      {/* Custom Centered Navigation Bar */}
      <nav className={`bg-zinc-50 dark:bg-[#09090b] px-6 py-4 flex flex-wrap items-center justify-center gap-6 text-sm tracking-wider font-mono select-none w-full sticky top-0 z-50 transition-all duration-200 ${
        isScrolled 
          ? "border-b border-zinc-200 dark:border-zinc-800" 
          : "border-b border-transparent"
      }`}>
        <div className="flex items-center space-x-2">
          <div className="h-5 w-5 border border-zinc-700 bg-zinc-900 flex items-center justify-center font-bold text-zinc-100 text-[10px]">
            H
          </div>
          <span className="font-bold tracking-widest text-zinc-900 dark:text-zinc-100">HIROSHI</span>
        </div>
        
        <span className="text-zinc-300 dark:text-zinc-800">|</span>
        
        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition">Changelog</a>
        <Link href="/docs" className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition">Docs</Link>
        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition">Team</a>
        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition">Enterprise</a>
        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition">Join Us</a>
        
        <span className="text-zinc-300 dark:text-zinc-800">|</span>
        
        <Link 
          href="/docs/getting-started/installation" 
          className="custom-download-btn px-4 py-1.5 rounded text-xs font-semibold transition"
        >
          Download
        </Link>

        <PixelThemeSwitcher />
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center pt-20 pb-20 px-6 max-w-6xl mx-auto w-full relative z-10">
        
        {/* Release badge */}
        <div className="mb-10">
          <a
            href="#"
            className="inline-flex items-center space-x-2.5 text-xs dark:text-zinc-400 text-zinc-600 hover:dark:text-zinc-200 hover:text-zinc-900 transition tracking-wide border dark:border-zinc-800 border-zinc-200 px-4 py-1.5 rounded-full dark:bg-zinc-900/30 bg-zinc-100/50"
          >
            <span>See what's new in 0.70.0</span>
            <span className="text-zinc-400">→</span>
          </a>
        </div>

        {/* Corrected Big Block ASCII Title: HIROSHI */}
        <div className="mb-10 text-center select-none overflow-x-auto max-w-full">
          <pre className="dark:text-zinc-50 text-zinc-900 text-[10px] sm:text-xs leading-none font-bold tracking-tight inline-block text-left">
            {`██   ██  ███████  ██████    ██████   ██████  ██   ██  ███████
██   ██    ██     ██   ██  ██    ██ ██       ██   ██    ██
███████    ██     ██████   ██    ██  ██████  ███████    ██
██   ██    ██     ██   ██  ██    ██       ██ ██   ██    ██
██   ██  ███████  ██   ██   ██████   ██████  ██   ██  ███████`}
          </pre>
        </div>

        {/* Hero Copy */}
        <div className="text-center max-w-2xl mb-14">
          <h2 className="text-xl dark:text-zinc-100 text-zinc-900 font-semibold mb-5 tracking-tight">
            Run parallel coding agents in the background.
          </h2>
          <p className="text-sm dark:text-zinc-300 text-zinc-605 leading-relaxed font-sans">
            An ultra-lightweight, self-hosted, multi-agent AI operating system built in Rust.
            Run parallel coding loops locally, sandboxed, and 100% offline.
          </p>
        </div>

        {/* Hero CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-24 w-full sm:w-auto">
          <Link
            href="/docs/getting-started/installation"
            className="w-full sm:w-auto bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-950 px-8 py-3.5 rounded-lg text-sm font-semibold transition flex items-center justify-center space-x-2 font-sans shadow"
          >
            <span>Download Hiroshi</span>
            <svg
              className="w-4.5 h-4.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              ></path>
            </svg>
          </Link>

          <Link
            href="/docs"
            className="w-full sm:w-auto border dark:border-zinc-800 border-zinc-300 dark:bg-zinc-900/30 bg-zinc-100/50 hover:dark:bg-zinc-900/80 hover:bg-zinc-200/80 dark:text-zinc-200 text-zinc-700 px-8 py-3.5 rounded-lg text-sm font-semibold transition flex items-center justify-center space-x-2 font-sans"
          >
            <span>Learn how it works</span>
            <span className="text-zinc-400">→</span>
          </Link>
        </div>

        {/* Space for Hero Image (Placeholder) */}
        <div className="w-full border border-dashed dark:border-zinc-800 border-zinc-300 dark:bg-zinc-900/10 bg-zinc-100/10 rounded-xl overflow-hidden min-h-[480px] max-w-5xl flex items-center justify-center mb-28">
          <div className="text-center font-mono text-sm dark:text-zinc-500 text-zinc-400">
            [ Workspace Cockpit / Dashboard Mockup Image Placeholder ]
          </div>
        </div>

        {/* Powered by Grid / Logo Wall */}
        <div className="w-full text-center mb-28">
          <div className="text-xs uppercase tracking-widest dark:text-zinc-500 text-zinc-400 mb-10 font-bold">
            [ Powered by ]
          </div>
          <div className="flex flex-wrap items-center justify-center gap-12 max-w-4xl mx-auto select-none">
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/vercel/wordmark.svg"
              alt="Vercel"
              className="h-6 w-auto opacity-75 dark:invert hover:opacity-100 transition duration-200"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/openai/wordmark.svg"
              alt="OpenAI"
              className="h-6 w-auto opacity-75 dark:invert hover:opacity-100 transition duration-200"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/cursor/wordmark.svg"
              alt="Cursor"
              className="h-5 w-auto opacity-75 dark:invert hover:opacity-100 transition duration-200"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/wordmark.svg"
              alt="GitHub"
              className="h-6 w-auto opacity-75 dark:invert hover:opacity-100 transition duration-200"
            />
          </div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-32 text-sm tracking-normal font-sans">
          <div className="p-6 border dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900/10 bg-zinc-150/10 rounded-xl flex flex-col justify-between space-y-6">
            <p className="dark:text-zinc-200 text-zinc-800 italic leading-relaxed">
              "Hiroshi's offline Ollama execution and local vector search give us full code privacy with under 5ms execution latency."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-205 flex items-center justify-center font-bold text-xs">
                BL
              </div>
              <div>
                <span className="font-semibold dark:text-zinc-100 text-zinc-900 block">
                  Brandon
                </span>
                <span className="dark:text-zinc-400 text-zinc-600 block text-xs">Co-founder</span>
              </div>
            </div>
          </div>

          <div className="p-6 border dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900/10 bg-zinc-150/10 rounded-xl flex flex-col justify-between space-y-6">
            <p className="dark:text-zinc-200 text-zinc-800 italic leading-relaxed">
              "Running parallel, background-active developer loops with whitelisted commands is an absolute lifesaver. We run tests overnight and review diffs."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-205 flex items-center justify-center font-bold text-xs">
                JP
              </div>
              <div>
                <span className="font-semibold dark:text-zinc-100 text-zinc-900 block">Josh</span>
                <span className="dark:text-zinc-400 text-zinc-600 block text-xs">Founder</span>
              </div>
            </div>
          </div>

          <div className="p-6 border dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900/10 bg-zinc-150/10 rounded-xl flex flex-col justify-between space-y-6">
            <p className="dark:text-zinc-200 text-zinc-800 italic leading-relaxed">
              "The Telegram integration and inquire setup wizard make it the most polished developer tool I've seen this year."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-205 flex items-center justify-center font-bold text-xs">
                NX
              </div>
              <div>
                <span className="font-semibold dark:text-zinc-100 text-zinc-900 block">
                  Pieter
                </span>
                <span className="dark:text-zinc-400 text-zinc-600 block text-xs">
                  Founding Engineer
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="w-full max-w-3xl mb-32">
          <div className="flex justify-center mb-8">
            <span className="border dark:border-zinc-800 border-zinc-200 text-xs dark:text-zinc-300 text-zinc-600 dark:bg-zinc-900 bg-zinc-100 px-4 py-1.5 rounded font-bold uppercase tracking-wider">
              How it works
            </span>
          </div>

          <div className="space-y-8 font-sans text-sm">
            <div className="flex items-start space-x-5">
              <span className="font-mono dark:text-zinc-500 text-zinc-400 font-bold text-base">
                1.
              </span>
              <div>
                <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-1.5 text-base">
                  Setup.
                </h4>
                <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                  Start the binary. The inquire onboarding wizard automatically detects Ollama ports and configures Telegram tokens.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-5">
              <span className="font-mono dark:text-zinc-500 text-zinc-400 font-bold text-base">
                2.
              </span>
              <div>
                <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-1.5 text-base">
                  Configure.
                </h4>
                <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                  Declare agent prompts and whitelisted tools inside AGENTS.md. Tokio loops route agent actions dynamically.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-5">
              <span className="font-mono dark:text-zinc-500 text-zinc-400 font-bold text-base">
                3.
              </span>
              <div>
                <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-1.5 text-base">
                  Extend.
                </h4>
                <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                  Drop custom scripts into ~/.hiroshi/skills/ or connect community JSON-RPC stdio MCP servers.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="w-full max-w-3xl mb-32">
          <div className="flex justify-center mb-8">
            <span className="border dark:border-zinc-800 border-zinc-200 text-xs dark:text-zinc-300 text-zinc-600 dark:bg-zinc-900 bg-zinc-100 px-4 py-1.5 rounded font-bold uppercase tracking-wider">
              Frequently asked questions
            </span>
          </div>

          <div className="space-y-8 font-sans text-sm">
            <div>
              <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-2 text-base">
                Does Hiroshi require an internet connection?
              </h4>
              <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                No. Hiroshi is 100% offline-capable, utilizing local Ollama server instances and native Rust vector computations.
              </p>
            </div>

            <div>
              <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-2 text-base">
                Is execution secure?
              </h4>
              <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                Yes. Scripts execute strictly inside a path-sanitized workspace with whitelisted commands and a 10s timeout circuit breaker.
              </p>
            </div>

            <div>
              <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-2 text-base">
                What is the resource footprint?
              </h4>
              <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                Hiroshi runs as a lightweight background daemon consuming less than 40 MB RAM with under 5ms execution loop latency.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA Block */}
        <div className="w-full text-center border-t dark:border-zinc-900 border-zinc-200 pt-20 flex flex-col items-center">
          <p className="text-sm dark:text-zinc-400 text-zinc-600 mb-8 font-sans">
            We built Hiroshi using Hiroshi. We think you'll like it as much as
            we do.
          </p>
          <a
            href="/docs/getting-started/installation"
            className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-950 px-8 py-4 rounded-lg text-sm font-semibold transition flex items-center justify-center space-x-2 font-sans shadow"
          >
            <span>Download Hiroshi</span>
            <svg
              className="w-4.5 h-4.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              ></path>
            </svg>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t dark:border-zinc-900 border-zinc-200 dark:bg-zinc-950/20 bg-zinc-100/20 px-6 py-16 text-sm font-sans">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          <div>
            <span className="text-xs uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-4 font-mono font-bold">
              [Company]
            </span>
            <div className="space-y-2 dark:text-zinc-400 text-zinc-600">
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Team
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Blog
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Enterprise
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Join us
              </a>
            </div>
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-4 font-mono font-bold">
              [Resources]
            </span>
            <div className="space-y-2 dark:text-zinc-400 text-zinc-600">
              <Link
                href="/docs"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Docs
              </Link>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Changelog
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Brand kit
              </a>
            </div>
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-4 font-mono font-bold">
              [Legal]
            </span>
            <div className="space-y-2 dark:text-zinc-400 text-zinc-600">
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Privacy
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Terms
              </a>
            </div>
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-4 font-mono font-bold">
              [Connect]
            </span>
            <div className="space-y-2 dark:text-zinc-400 text-zinc-600">
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                X
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                YouTube
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Reddit
              </a>
              <a href="#" className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition">
                Discord
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs dark:text-zinc-500 text-zinc-400 font-mono">
          <span>© 2026 Melty Labs</span>
          <span>HIROSHI OS // CLONE COCKPIT</span>
        </div>
      </footer>
    </div>
  );
}
