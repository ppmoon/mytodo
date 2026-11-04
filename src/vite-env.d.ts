/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: { readonly 0: { transcript: string }; readonly isFinal: boolean };
}

interface Window {
  webkitSpeechRecognition?: new () => SpeechRecognition;
  SpeechRecognition?: new () => SpeechRecognition;
}

declare module "lunar-javascript" {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): {
      getLunar(): {
        getMonthInChinese(): string;
        getDayInChinese(): string;
      };
    };
  }
}
