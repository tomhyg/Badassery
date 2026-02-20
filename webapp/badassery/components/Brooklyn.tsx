import React, { useState, useEffect } from 'react';

interface BrooklynMessage {
  text: string;
  emoji: string;
  country: '🇫🇷' | '🇺🇸' | '🇱🇧' | '🇰🇪';
}

export const Brooklyn: React.FC = () => {
  const [message, setMessage] = useState<BrooklynMessage | null>(null);
  const [position, setPosition] = useState(0);
  const [isMoving, setIsMoving] = useState(true);

  const getTimeBasedMessages = (): BrooklynMessage[] => {
    const hour = new Date().getHours();

    // Matin (6h-9h)
    if (hour >= 6 && hour < 9) {
      return [
        { text: "Bonjour! Café + croissant = ready to work! ☕", emoji: "🥐", country: "🇫🇷" },
        { text: "Good morning! Let's catch some podcasts! 🎙️", emoji: "☕", country: "🇺🇸" },
        { text: "صباح الخير! Sabah el kheir! Time to shine! ✨", emoji: "☀️", country: "🇱🇧" },
        { text: "Habari za asubuhi! Ruth's morning energy activated! 🌅", emoji: "☀️", country: "🇰🇪" },
        { text: "Trop tôt... besoin de café... zzz... 😴", emoji: "☕", country: "🇫🇷" }
      ];
    }

    // Milieu de matinée (9h-12h)
    if (hour >= 9 && hour < 12) {
      return [
        { text: "Pause clope? Non, pause spider web! 🕸️", emoji: "🚬", country: "🇫🇷" },
        { text: "Weaving through podcast data... busy bee... err spider! 🕷️", emoji: "💻", country: "🇺🇸" },
        { text: "Yalla! Let's hustle! 💪", emoji: "🚀", country: "🇱🇧" },
        { text: "Hakuna matata! Working with Ruth's vibes! 🦁", emoji: "✨", country: "🇰🇪" },
        { text: "Je tisse ma toile, tranquille... 🕸️", emoji: "😌", country: "🇫🇷" }
      ];
    }

    // Déjeuner (12h-14h)
    if (hour >= 12 && hour < 14) {
      return [
        { text: "C'est l'heure du déjeuner! 2h minimum hein! 🍷", emoji: "🍽️", country: "🇫🇷" },
        { text: "Lunch break! Quick sandwich at the desk! 🥪", emoji: "⚡", country: "🇺🇸" },
        { text: "Mezze time! Hummus, tabbouleh... yum! 🥙", emoji: "😋", country: "🇱🇧" },
        { text: "Ugali & nyama choma time! Ruth's favorite! 🍖", emoji: "😋", country: "🇰🇪" },
        { text: "Fromage ou dessert? LES DEUX! 🧀", emoji: "🍰", country: "🇫🇷" }
      ];
    }

    // Après-midi (14h-16h)
    if (hour >= 14 && hour < 16) {
      return [
        { text: "Digestion time... working at 50%... 😴", emoji: "💤", country: "🇫🇷" },
        { text: "Afternoon grind! Coffee #3 incoming! ☕", emoji: "💪", country: "🇺🇸" },
        { text: "Ahla wa sahla! Welcome to the afternoon hustle! 🎯", emoji: "⚡", country: "🇱🇧" },
        { text: "Pole pole! Slowly but surely like Ruth says! 🐘", emoji: "💪", country: "🇰🇪" },
        { text: "Le goûter approche... cookies? 🍪", emoji: "👀", country: "🇫🇷" }
      ];
    }

    // Goûter (16h-17h)
    if (hour >= 16 && hour < 17) {
      return [
        { text: "C'EST L'HEURE DU GOÛTER! 🍪🍫", emoji: "🎉", country: "🇫🇷" },
        { text: "Snack time! Les enfants ont raison! 😋", emoji: "🍪", country: "🇫🇷" },
        { text: "Chai na mandazi! Kenyan tea time with Ruth! ☕", emoji: "🫖", country: "🇰🇪" },
        { text: "Tea time... but make it French! ☕🥐", emoji: "🇫🇷", country: "🇫🇷" },
        { text: "Pain au chocolat ou chocolatine? (It's pain au chocolat) 🥐", emoji: "😤", country: "🇫🇷" }
      ];
    }

    // Fin d'après-midi (17h-19h)
    if (hour >= 17 && hour < 19) {
      return [
        { text: "17h = home time en France! Mais on est pas en France... 😅", emoji: "🏃", country: "🇫🇷" },
        { text: "Still going strong! American work ethic! 💼", emoji: "💪", country: "🇺🇸" },
        { text: "Khalas, soon time to wrap up! 🌆", emoji: "🌅", country: "🇱🇧" },
        { text: "Jambo! Ruth's energy still going! Safari isn't over! 🦒", emoji: "💪", country: "🇰🇪" },
        { text: "Grève de 17h? Non? Ok je continue... 😂", emoji: "🪧", country: "🇫🇷" }
      ];
    }

    // Soirée (19h-23h)
    if (hour >= 19 && hour < 23) {
      return [
        { text: "Bonne soirée! Apéro time? 🍷", emoji: "🥂", country: "🇫🇷" },
        { text: "Evening grind! Let's finish strong! 🚀", emoji: "💻", country: "🇺🇸" },
        { text: "مساء الخير! Masa el kheir! Night shift activated! 🌙", emoji: "⭐", country: "🇱🇧" },
        { text: "Karibu usiku! Evening vibes with Ruth's playlist! 🎵", emoji: "🌙", country: "🇰🇪" },
        { text: "Working late... à la française! (rare mais ça arrive) 😅", emoji: "🌙", country: "🇫🇷" }
      ];
    }

    // Nuit (23h-6h)
    return [
      { text: "Zzz... even spiders need sleep! 😴", emoji: "💤", country: "🇺🇸" },
      { text: "Bonne nuit! Dormez bien! 🌙", emoji: "😴", country: "🇫🇷" },
      { text: "Tisbah ala khair! Good night! 💫", emoji: "🌙", country: "🇱🇧" },
      { text: "Lala salama! Ruth says good night! 🌟", emoji: "😴", country: "🇰🇪" },
      { text: "Spider dreams = catching podcast flies! 🕸️✨", emoji: "💭", country: "🇺🇸" }
    ];
  };

  useEffect(() => {
    // Set initial random message
    const messages = getTimeBasedMessages();
    setMessage(messages[Math.floor(Math.random() * messages.length)]);

    // Change message every 30 seconds
    const messageInterval = setInterval(() => {
      const messages = getTimeBasedMessages();
      setMessage(messages[Math.floor(Math.random() * messages.length)]);
    }, 30000);

    // Animate position (left to right)
    const moveInterval = setInterval(() => {
      setPosition((prev) => {
        if (prev >= 100) {
          setIsMoving(false);
          setTimeout(() => {
            setIsMoving(true);
            setPosition(0);
          }, 2000); // Pause 2s at the end
          return 100;
        }
        return prev + 0.5;
      });
    }, 100);

    return () => {
      clearInterval(messageInterval);
      clearInterval(moveInterval);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
      <div
        className="absolute top-1/2 -translate-y-1/2 transition-all duration-100"
        style={{ left: `${position}%` }}
      >
        {/* Spider with speech bubble */}
        <div className="relative flex items-center gap-3">
          {/* Speech bubble */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl px-4 py-2 shadow-lg relative animate-bounce-slow">
            <div className="flex items-center gap-2">
              <span className="text-lg">{message.country}</span>
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                {message.text}
              </span>
              <span className="text-lg">{message.emoji}</span>
            </div>
            {/* Arrow pointing to spider */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
              <div className="w-0 h-0 border-t-8 border-t-transparent border-l-8 border-l-white border-b-8 border-b-transparent"></div>
              <div className="absolute right-[2px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-l-8 border-l-slate-200 border-b-8 border-b-transparent"></div>
            </div>
          </div>

          {/* Brooklyn the spider */}
          <div className={`text-4xl ${isMoving ? 'animate-walk' : ''}`}>
            🕷️
          </div>
        </div>
      </div>

      {/* Add CSS animation for walking */}
      <style>{`
        @keyframes walk {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }

        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }

        .animate-walk {
          animation: walk 0.3s ease-in-out infinite;
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
