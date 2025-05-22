import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Ciyu from "./Ciyu";
import { X } from "lucide-react";

const exampleParsed = [
  {
    "token": "你",
    "pinyin": "ni3",
    "definition": "you"
  },
  {
    "token": "有",
    "pinyin": "you3",
    "definition": "have"
  },
  {
    "token": "光明",
    "pinyin": "guang1 ming2",
    "definition": "bright"
  },
  {
    "token": "的",
    "pinyin": "de",
    "definition": "'s (possessive particle)"
  },
  {
    "token": "未来",
    "pinyin": "wei4 lai2",
    "definition": "future"
  },
  {
    "token": "。",
    "pinyin": "",
    "definition": ""
  }
];

export default function InfoModal({ isOpen, onClose, children }) {
  const modalRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocus.current = document.activeElement;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) firstElement.focus();

    const handleTab = (e) => {
      if (e.key !== "Tab") return;
      if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      } else if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    };

    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleTab);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleTab);
      document.removeEventListener("keydown", handleEscape);
      previousFocus.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={modalRef}
      role="dialog"
      className="fixed inset-0 flex items-center justify-center p-4 z-20000"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative bg-red-300 rounded-lg shadow-xl max-w-full max-h-[90vh] w-full md:w-auto md:min-w-[500px] overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100/60"
        >
          <X />
        </button>

        {/* Content */}
        <div className="p-6 text-black text-sm md:text-base lg:text-base border-black border-2 rounded-md">
          <h2 id="modal-title" className="text-lg md:text-xl lg:text-3xl font-bold mb-4 text-center">
            About
          </h2>
          <div className="prose flex flex-col">
            {children}
            <span>HanziLens is a tool that gives you an at a glance overview/break down of a Chinese sentence.</span>
            <span>To help you <b>understand</b> the sentence, not just give you a translation.</span>
            <span>&nbsp;</span>       
            <span className="font-bold text-base md:text-lg lg:text-xl">Usage</span>
            <span>1. Paste or type in a Chinese sentence, and click <span className="text-white font-bold">Go</span></span>
            <span>2. Wait (It can take up to 1 minute)</span>
            <span>3. Take a look</span>

            <span className="py-2">
              <div className="text-lg md:text-2xl lg:text-4xl text-black text-center">You have a bright future.</div>
              <div className="flex flex-col md:flex-row gap-3 md:gap-0 justify-center items-center flex-wrap pt-3">
                {exampleParsed.map((entry) => (
                  <Ciyu
                    key={entry.token}
                    text={entry.token}
                    pinyin={entry.pinyin.split(" ")}
                    definition={entry.definition}
                  />
                ))}
              </div>
            </span>

            <span className="font-bold text-base md:text-lg lg:text-xl">Try it!</span>
            <span className="pb-2">Clicking on a word/segment will bring up its dictionary listing, and there is a link on the bottom right to the MDBG entry for that word.</span>
            <span>The entries take up a good amount of space, so you can drag them around the window, and click on the word again to close it.</span>

            <span>&nbsp;</span>
            <span className="font-bold text-base md:text-lg lg:text-xl">Notes</span>
            <ul className="list-disc pl-[1em]">
              <li>There is a maximum input size of 150 characters. Using the entire 150 characters is not recommended however, as sentences of that size take upwards of 1 minute to load.</li>
              <li>The English translation is provided by Google Translate, and the sentence breakdown is done by prompting Qwen2.5 72B</li>
            </ul>

            <span>&nbsp;</span>
            <span className="font-bold text-base md:text-lg lg:text-xl">Limitations</span>
            <ul className="list-disc pl-[1em]">
              <li>Because the sentence processing is done by prompting Qwen2.5 72B Instruct, there is unfortunately inconsistency and sometimes inaccuracy, as well as long loading times.</li>
              <li>8-60+ seconds depending on the length of the sentence (the sentence in the example can be considered as short).</li>
              <li>The prompt is centered around analyzing sentences with semantic meaning, so shorter strings of text may yield off or unsatisfactory results.</li>
            </ul>

            <span>&nbsp;</span>
            <span className="font-bold text-base md:text-lg lg:text-xl">Next Steps</span>
            <span>Fine-tuning a smaller specialized model specifically for analyzing and breaking down Chinese sentences in this manner to reduce loading time.</span>
            <span>Cross checking LLM results with dictionary entries to ensure accuracy.</span>
            <span>Transition from LLM workflow to LLM agent doing the break downs.</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}