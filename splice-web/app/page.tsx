"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { IconPlayerPlay } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo/logo";

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export default function page() {
  const prefersReduced = useReducedMotion();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 bg-background/60 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-bold text-sm tracking-tight flex items-center gap-1.5">
              Splice Studio
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/editor">
              <Button size="sm" className="text-xs gap-1.5 font-semibold">
                <IconPlayerPlay data-icon="inline-start" /> Open Studio
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative min-h-screen flex items-center justify-center px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[140px]"
            animate={
              prefersReduced
                ? {}
                : { scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }
            }
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <motion.div
          className="max-w-3xl mx-auto text-center relative"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            variants={item}
            className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-5"
          >
            Edit video
            <br />
            <span className="text-muted-foreground">like you edit code.</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="text-base text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed"
          >
            Branch. Commit. Compare. Never lose a cut again.
          </motion.p>

          <motion.div
            variants={item}
            className="flex items-center justify-center gap-3"
          >
            <Link href="/editor">
              <Button size="lg" className="text-sm gap-2 font-semibold px-7">
                <IconPlayerPlay data-icon="inline-start" /> Open Editor
              </Button>
            </Link>
            <Link href="/history">
              <Button
                size="lg"
                variant="ghost"
                className="text-sm gap-2 px-5 text-muted-foreground"
              >
                History
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
