import { useState, useEffect, useRef } from "react";
import { convertPinyin } from "../utils/Utils";
import { useZIndexStore } from "../stores/useZIndexStore";
import { BookText, X } from "lucide-react";

function DictionaryPopup({ token, onClose }) {
  const { getNextZIndex } = useZIndexStore();
  const [dictionaryData, setDictionaryData] = useState([]);
  const [zIndex, setZIndex] = useState(100);
  const [position, setPosition] = useState({ dx: 0, dy: 0, });
  const popupRef = useRef(null);

  useEffect(() => {
    dictionaryLookup(token);
    setZIndex(getNextZIndex());

  }, [token, getNextZIndex]);

  const dictionaryLookup = async (token) => {
    const response = await fetch(`${import.meta.env.VITE_BASE_URL}/definitionLookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: token }),
    });
    const data = await response.json();
    setDictionaryData(data.dictionaryData);
  };

  const PinyinEntry = ({ entry }) => {
    return (
      <div className="pl-1 py-1">
        <div className="flex flex-col">
          <div className="token flex flex-row text-[1.2em]">
            {entry.simplified === entry.traditional ? (
              <span className="pr-2">{entry.traditional}</span>
            ) : (
              <>
                <span className="pr-2">{entry.simplified}</span>
                <span className="pr-2">{entry.traditional}</span>
              </>
            )}
            <span>
              {convertPinyin(entry.pinyin).pinyinString.map((pinyin, index) => (
                <span
                  key={index}
                  style={{ color: convertPinyin(entry.pinyin).colors[index] }}
                >
                  {pinyin}{" "}
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="definitions text-[0.8em]">
          {entry.english.map((definition, index) => (
            <span key={index}>
              {index < entry.english.length - 1
                ? `${definition} ◆ `
                : definition}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const handleMouseDown = (e) => {
    setZIndex(getNextZIndex());
    const startPos = {
      x: e.clientX - position.dx,
      y: e.clientY - position.dy,
    };

    const handleMouseMove = (e) => {
      const popup = popupRef.current;
      if (!popup) return;

      const dx = e.clientX - startPos.x;
      const dy = e.clientY - startPos.y;

      popup.style.transform = `translate(${dx}px, ${dy}px)`;
      setPosition({ dx, dy });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  const handleTouchStart = (e) => {
    setZIndex(getNextZIndex());
    const touch = e.touches[0];

    const startPos = {
      x: touch.clientX - position.dx,
      y: touch.clientY - position.dy,
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      const popup = popupRef.current;
      if (!popup) return;

      const touch = e.touches[0];
      const dx = touch.clientX - startPos.x;
      const dy = touch.clientY - startPos.y;

      popup.style.transform = `translate(${dx}px, ${dy}px)`;
      setPosition({ dx, dy });
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove, { passive: false });
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };
  
  return (
    <div
      ref={popupRef}
      style={{ 
        zIndex: zIndex,
        position: 'absolute',
        touchAction: 'none',
        userSelect: 'none',
      }}
      className="border border-black shadow-xl rounded-sm bg-amber-200 text-black w-[300px] md:w-[400px] lg:w-[600px]"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {dictionaryData.map((entry, index) => (
        <div style={{ maxWidth: index == dictionaryData.length - 1 ? "80%" : "" }}>  
          <PinyinEntry key={index} entry={entry} />
        </div>
      ))}
      <X size={15} className="absolute right-1 top-1 hover:cursor-auto" onClick={onClose}/>

      <a href={`https://www.mdbg.net/chinese/dictionary?wdqb=${token}`} target="_blank" rel="noopener noreferrer" className="absolute right-1 bottom-1 flex items-center">
        <BookText size={15} />MDBG
      </a>
    </div>
  );
}

export default DictionaryPopup;