"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelThemeSwitcher } from "../../components/ThemeSwitcher";

function InteractiveTitle() {
  const base = `██   ██  ███████  ██████    ██████   ██████  ██   ██  ███████
██   ██    ██     ██   ██  ██    ██ ██       ██   ██    ██
███████    ██     ██████   ██    ██  ██████  ███████    ██
██   ██    ██     ██   ██  ██    ██       ██ ██   ██    ██
██   ██  ███████  ██   ██   ██████   ██████  ██   ██  ███████`;

  const [display, setDisplay] = useState(base);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isHovered) {
      setDisplay(base);
      return;
    }

    const interval = setInterval(() => {
      const chars = base.split("");
      const glitched = chars.map((char) => {
        if (char === " " || char === "\n") return char;
        if (Math.random() < 0.15) {
          const glyphs = ["░", "▒", "▓", "X", "0", "1", "?", "*", "#", "H", "I", "R", "O", "S", "H", "I"];
          return glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        return char;
      });
      setDisplay(glitched.join(""));
    }, 80);

    return () => clearInterval(interval);
  }, [isHovered]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="mb-10 text-center select-none overflow-x-auto max-w-full cursor-pointer"
    >
      <pre
        className={`text-[10px] sm:text-xs leading-none font-bold tracking-tight inline-block text-left transition-colors duration-150 ${
          isHovered
            ? "text-emerald-500 dark:text-emerald-400 font-mono"
            : "dark:text-zinc-50 text-zinc-900 font-mono"
        }`}
      >
        {display}
      </pre>
    </div>
  );
}

function GiantInteractiveTitle() {
  const base = `██   ██  ███████  ██████    ██████   ██████  ██   ██  ███████
██   ██    ██     ██   ██  ██    ██ ██       ██   ██    ██
███████    ██     ██████   ██    ██  ██████  ███████    ██
██   ██    ██     ██   ██  ██    ██       ██ ██   ██    ██
██   ██  ███████  ██   ██   ██████   ██████  ██   ██  ███████`;

  const [display, setDisplay] = useState(base);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isHovered) {
      setDisplay(base);
      return;
    }

    const interval = setInterval(() => {
      const chars = base.split("");
      const glitched = chars.map((char) => {
        if (char === " " || char === "\n") return char;
        if (Math.random() < 0.15) {
          const glyphs = ["░", "▒", "▓", "X", "0", "1", "?", "*", "#", "H", "I", "R", "O", "S", "H", "I"];
          return glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        return char;
      });
      setDisplay(glitched.join(""));
    }, 80);

    return () => clearInterval(interval);
  }, [isHovered]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="text-center select-none overflow-hidden cursor-pointer w-full flex justify-center py-10"
    >
      <pre
        className={`text-[3vw] md:text-[2vw] leading-none font-bold tracking-tight inline-block text-left transition-colors duration-150 ${
          isHovered
            ? "text-emerald-500 dark:text-emerald-400 font-mono"
            : "dark:text-zinc-50 text-zinc-900 font-mono"
        }`}
      >
        {display}
      </pre>
    </div>
  );
}

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
      <div className="dither-overlay" />
      {/* Custom Centered Navigation Bar */}
      <nav
        className={`bg-zinc-50 dark:bg-[#09090b] px-6 py-4 flex flex-wrap items-center justify-center gap-6 text-sm tracking-wider font-mono select-none w-full sticky top-0 z-50 transition-all duration-200 ${
          isScrolled
            ? "border-b border-zinc-200 dark:border-zinc-800"
            : "border-b border-transparent"
        }`}
      >
        <div className="flex items-center space-x-2">
          <div className="h-5 w-5 border border-zinc-700 bg-zinc-900 flex items-center justify-center font-bold text-zinc-100 text-[10px]">
            H
          </div>
          <span className="font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
            HIROSHI
          </span>
        </div>

        <span className="text-zinc-300 dark:text-zinc-800">|</span>

        <a
          href="#"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition"
        >
          Changelog
        </a>
        <Link
          href="/docs"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition"
        >
          Docs
        </Link>
        <a
          href="#"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition"
        >
          Team
        </a>
        <a
          href="#"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition"
        >
          Enterprise
        </a>
        <a
          href="#"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-650 dark:text-zinc-400 transition"
        >
          Join Us
        </a>

        <span className="text-zinc-305 dark:text-zinc-800">|</span>

        <Link
          href="/docs/getting-started/installation"
          className="custom-download-btn px-4 py-1.5 rounded text-xs font-semibold transition"
        >
          Download
        </Link>

        <PixelThemeSwitcher />
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center pt-40 pb-20 px-6 max-w-6xl mx-auto w-full relative z-10">
        {/* Release badge
        <div className="mb-10">
          <a
            href="#"
            className="inline-flex items-center space-x-2.5 text-xs dark:text-zinc-400 text-zinc-600 hover:dark:text-zinc-200 hover:text-zinc-900 transition tracking-wide border dark:border-zinc-800 border-zinc-200 px-4 py-1.5 rounded-full dark:bg-zinc-900/30 bg-zinc-100/50"
          >
            <span>See what's new in 0.70.0</span>
            <span className="text-zinc-400">→</span>
          </a>
        </div>*/}

        {/* Corrected Big Block ASCII Title: HIROSHI */}
        <InteractiveTitle />

        {/* Hero Copy */}
        <div className="text-center max-w-2xl mb-14">
          <h2 className="text-xl dark:text-zinc-100 text-zinc-900 font-semibold mb-5 tracking-tight">
            Parallel agents, Bare-metal performance, No cloud dependencies
          </h2>
          <p className="text-sm dark:text-zinc-300 text-zinc-600 leading-relaxed font-sans">
            An ultra-lightweight, self-hosted, multi-agent AI operating system
            built in Rust. Run parallel coding loops locally, sandboxed, and
            100% offline.
          </p>
        </div>

        {/* Hero CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-20 w-full sm:w-auto">
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
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
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

        {/* Installation Terminal Box */}
        <div className="w-full max-w-2xl border dark:border-zinc-800 border-zinc-300 bg-zinc-100 dark:bg-[#18181b] rounded-lg overflow-hidden shadow-sm mb-28 font-mono">
          <div className="flex items-center justify-between px-4 py-2 border-b dark:border-zinc-800 border-zinc-200 bg-zinc-250 dark:bg-zinc-900/50 text-xs dark:text-zinc-400 text-zinc-650">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-700" />
            </div>
            <span>bash</span>
            <div className="w-10" />
          </div>
          <div className="p-5 text-sm dark:text-zinc-100 text-zinc-800 space-y-1 select-all overflow-x-auto leading-relaxed">
            <div className="flex">
              <span className="text-zinc-400 dark:text-zinc-600 mr-3 select-none">
                $
              </span>
              git clone https://github.com/hiroshi-os/hiroshi.git
            </div>
            <div className="flex">
              <span className="text-zinc-400 dark:text-zinc-600 mr-3 select-none">
                $
              </span>
              cd hiroshi
            </div>
            <div className="flex">
              <span className="text-zinc-400 dark:text-zinc-600 mr-3 select-none">
                $
              </span>
              cargo build --release
            </div>
            <div className="flex">
              <span className="text-zinc-400 dark:text-zinc-600 mr-3 select-none">
                $
              </span>
              ./target/release/hiroshi
            </div>
          </div>
        </div>

        {/* Powered by Grid / Logo Wall */}
        <div className="w-full text-center mb-28">
          <div className="text-xs uppercase tracking-widest dark:text-zinc-500 text-zinc-400 mb-10 font-bold">
            [ Powered by ]
          </div>
          <div className="flex flex-wrap items-center justify-center gap-12 max-w-4xl mx-auto select-none">
            {/* Vercel */}
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/vercel/wordmark-light.svg"
              alt="Vercel"
              className="h-6 w-auto opacity-75 hover:opacity-100 transition duration-200 dark:hidden block"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/vercel/wordmark-dark.svg"
              alt="Vercel"
              className="h-6 w-auto opacity-75 hover:opacity-100 transition duration-200 hidden dark:block"
            />

            {/* OpenAI */}
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/openai/wordmark-light.svg"
              alt="OpenAI"
              className="h-6 w-auto opacity-75 hover:opacity-100 transition duration-200 dark:hidden block"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/openai/wordmark-dark.svg"
              alt="OpenAI"
              className="h-6 w-auto opacity-75 hover:opacity-100 transition duration-200 hidden dark:block"
            />

            {/* Cursor */}
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/cursor/wordmark-light.svg"
              alt="Cursor"
              className="h-5 w-auto opacity-75 hover:opacity-100 transition duration-200 dark:hidden block"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/cursor/wordmark-dark.svg"
              alt="Cursor"
              className="h-5 w-auto opacity-75 hover:opacity-100 transition duration-200 hidden dark:block"
            />

            {/* GitHub */}
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/wordmark-light.svg"
              alt="GitHub"
              className="h-6 w-auto opacity-75 hover:opacity-100 transition duration-200 dark:hidden block"
            />
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/wordmark-dark.svg"
              alt="GitHub"
              className="h-6 w-auto opacity-75 hover:opacity-100 transition duration-200 hidden dark:block"
            />
          </div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-32 text-sm tracking-normal font-sans">
          <div className="p-6 border dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900/10 bg-zinc-150/10 rounded-xl flex flex-col justify-between space-y-6">
            <p className="dark:text-zinc-200 text-zinc-800 italic leading-relaxed">
              "Hiroshi's offline Ollama execution and local vector search give
              us full code privacy with under 5ms execution latency."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-bold text-xs">
                BL
              </div>
              <div>
                <span className="font-semibold dark:text-zinc-100 text-zinc-900 block">
                  Brandon
                </span>
                <span className="dark:text-zinc-400 text-zinc-600 block text-xs">
                  Co-founder
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 border dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900/10 bg-zinc-150/10 rounded-xl flex flex-col justify-between space-y-6">
            <p className="dark:text-zinc-200 text-zinc-800 italic leading-relaxed">
              "Running parallel, background-active developer loops with
              whitelisted commands is an absolute lifesaver. We run tests
              overnight and review diffs."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-bold text-xs">
                JP
              </div>
              <div>
                <span className="font-semibold dark:text-zinc-100 text-zinc-900 block">
                  Josh
                </span>
                <span className="dark:text-zinc-400 text-zinc-600 block text-xs">
                  Founder
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 border dark:border-zinc-800 border-zinc-200 dark:bg-zinc-900/10 bg-zinc-150/10 rounded-xl flex flex-col justify-between space-y-6">
            <p className="dark:text-zinc-200 text-zinc-800 italic leading-relaxed">
              "The Telegram integration and inquire setup wizard make it the
              most polished developer tool I've seen this year."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-bold text-xs">
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
                  Start the binary. The inquire onboarding wizard automatically
                  detects Ollama ports and configures Telegram tokens.
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
                  Declare agent prompts and whitelisted tools inside AGENTS.md.
                  Tokio loops route agent actions dynamically.
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
                  Drop custom scripts into ~/.hiroshi/skills/ or connect
                  community JSON-RPC stdio MCP servers.
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
                No. Hiroshi is 100% offline-capable, utilizing local Ollama
                server instances and native Rust vector computations.
              </p>
            </div>

            <div>
              <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-2 text-base">
                Is execution secure?
              </h4>
              <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                Yes. Scripts execute strictly inside a path-sanitized workspace
                with whitelisted commands and a 10s timeout circuit breaker.
              </p>
            </div>

            <div>
              <h4 className="font-semibold dark:text-zinc-200 text-zinc-900 mb-2 text-base">
                What is the resource footprint?
              </h4>
              <p className="dark:text-zinc-400 text-zinc-600 leading-relaxed">
                Hiroshi runs as a lightweight background daemon consuming less
                than 40 MB RAM with under 5ms execution loop latency.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA Block */}
        <div className="w-full text-center border-t dark:border-zinc-900 border-zinc-200 pt-20 flex flex-col items-center">
          <p className="text-sm dark:text-zinc-400 text-zinc-600 mb-8 font-sans">
            Accessible from WhatsApp, Telegram, or any chat app you already use.
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
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
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
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Team
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Blog
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Enterprise
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
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
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Changelog
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Brand kit
              </a>
            </div>
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-4 font-mono font-bold">
              [Legal]
            </span>
            <div className="space-y-2 dark:text-zinc-400 text-zinc-600">
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Privacy
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Terms
              </a>
            </div>
          </div>

          <div>
            <span className="text-xs uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-4 font-mono font-bold">
              [Connect]
            </span>
            <div className="space-y-2 dark:text-zinc-400 text-zinc-600">
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                X
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                YouTube
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Reddit
              </a>
              <a
                href="#"
                className="block hover:dark:text-zinc-200 hover:text-zinc-900 transition"
              >
                Discord
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs dark:text-zinc-500 text-zinc-400 font-mono">
          <span>© 2026 Tom</span>
          <span>tomlin7.com</span>
        </div>
      </footer>

      {/* Huge Interactive Title at the very bottom */}
      <div className="w-full py-20 flex justify-center border-t dark:border-zinc-900 border-zinc-200 select-none overflow-hidden bg-zinc-50 dark:bg-[#09090b]">
        <GiantInteractiveTitle />
      </div>
    </div>
  );
}
