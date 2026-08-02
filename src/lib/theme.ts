export type PlayerTheme = "red" | "green" | "blue" | "orange" | "slate";

export const themeStyles = {
  red: {
    text: "text-red-500",
    hoverText: "hover:text-red-400",
    bg: "bg-red-600",
    hoverBg: "hover:bg-red-500",
    border: "border-red-500",
    focusBorder: "focus:border-red-500/50",
    accent: "accent-red-600",
    pulseBg: "bg-red-950/20",
    pulseBorder: "border-red-900/30",
    pulseText: "text-red-400",
    badge: "bg-red-950 text-red-500 border-red-900/40",
    glow: "shadow-red-950/40",
  },
  green: {
    text: "text-emerald-500",
    hoverText: "hover:text-emerald-400",
    bg: "bg-emerald-600",
    hoverBg: "hover:bg-emerald-500",
    border: "border-emerald-500",
    focusBorder: "focus:border-emerald-500/50",
    accent: "accent-emerald-600",
    pulseBg: "bg-emerald-950/20",
    pulseBorder: "border-emerald-900/30",
    pulseText: "text-emerald-400",
    badge: "bg-emerald-950 text-emerald-500 border-emerald-900/40",
    glow: "shadow-emerald-950/40",
  },
  blue: {
    text: "text-blue-500",
    hoverText: "hover:text-blue-400",
    bg: "bg-blue-600",
    hoverBg: "hover:bg-blue-500",
    border: "border-blue-500",
    focusBorder: "focus:border-blue-500/50",
    accent: "accent-blue-600",
    pulseBg: "bg-blue-950/20",
    pulseBorder: "border-blue-900/30",
    pulseText: "text-blue-400",
    badge: "bg-blue-950 text-blue-500 border-blue-900/40",
    glow: "shadow-blue-950/40",
  },
  orange: {
    text: "text-orange-500",
    hoverText: "hover:text-orange-400",
    bg: "bg-orange-600",
    hoverBg: "hover:bg-orange-500",
    border: "border-orange-500",
    focusBorder: "focus:border-orange-500/50",
    accent: "accent-orange-600",
    pulseBg: "bg-orange-950/20",
    pulseBorder: "border-orange-900/30",
    pulseText: "text-orange-400",
    badge: "bg-orange-950 text-orange-500 border-orange-900/40",
    glow: "shadow-orange-950/40",
  },
  slate: {
    text: "text-zinc-300",
    hoverText: "hover:text-white",
    bg: "bg-zinc-700",
    hoverBg: "hover:bg-zinc-600",
    border: "border-zinc-500",
    focusBorder: "focus:border-zinc-500/50",
    accent: "accent-zinc-600",
    pulseBg: "bg-zinc-900/40",
    pulseBorder: "border-zinc-800",
    pulseText: "text-zinc-300",
    badge: "bg-zinc-900 text-zinc-300 border-zinc-850",
    glow: "shadow-zinc-950/40",
  },
};

export const getThemeGradient = (theme: PlayerTheme, seed: string = "") => {
  const hash = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % 3;

  if (theme === "red") {
    const gradients = [
      "from-red-600 to-orange-600",
      "from-rose-600 to-amber-500",
      "from-red-700 to-zinc-900"
    ];
    return gradients[index];
  }
  if (theme === "green") {
    const gradients = [
      "from-emerald-600 to-teal-600",
      "from-green-600 to-cyan-600",
      "from-emerald-700 to-zinc-900"
    ];
    return gradients[index];
  }
  if (theme === "blue") {
    const gradients = [
      "from-blue-600 to-cyan-500",
      "from-indigo-600 to-purple-600",
      "from-blue-700 to-zinc-900"
    ];
    return gradients[index];
  }
  if (theme === "orange") {
    const gradients = [
      "from-orange-500 to-red-500",
      "from-amber-500 to-fuchsia-600",
      "from-orange-700 to-zinc-900"
    ];
    return gradients[index];
  }
  const gradients = [
    "from-zinc-700 to-zinc-900",
    "from-slate-600 to-zinc-800",
    "from-zinc-800 to-stone-900"
  ];
  return gradients[index];
};
