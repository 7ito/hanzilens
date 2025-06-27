import { useState, useRef } from "react";
import DictionaryPopup from "./DictionaryPopup";
import { convertPinyin } from "../utils/Utils";

function Ciyu({ text, pinyin, definition }) {
  const [showPopup, setShowPopup] = useState(false);
  const parentRef = useRef(null);

  const Zi = ({ text, pinyin }) => {
    return (
      <div
        className="flex flex-col justify-center items-center"
        style={{ color: convertPinyin(pinyin).colors[0] || "#000000" }}
      >
        <div className="text-xl">
          {convertPinyin(pinyin).pinyinString[0] || "\u00A0"}
        </div>
        <div className="text-4xl">{text}</div>
      </div>
    );
  };

  const togglePopup = () => {
    if (!pinyin || !definition) {
      return;
    } else {
      setShowPopup(!showPopup);
    }
  };

  return (
    <div ref={parentRef} className="relative">
      <div
        style={{
          borderBottom: showPopup ? "3px solid #4c1e1e" : "",
          paddingBottom: showPopup ? "" : "3px",
        }}
        onClick={!pinyin && !definition ? undefined : togglePopup}
        className="pane px-7 flex justify-center items-center flex-col max-w-[300px]"
      >
        <div className="flex flex-row">
          {pinyin.map((pinyinEntry, index) => (
            <Zi
              text={
                pinyinEntry === ""
                  ? text
                  : text && text.substring(index, index + 1)
                  ? text.substring(index, index + 1)
                  : ""
              }
              pinyin={pinyinEntry}
            />
          ))}
        </div>
        <div className="definition line-clamp-3 transition-all group-hover:line-clamp-none">
          {definition}
        </div>
      </div>
      {showPopup && (
        <DictionaryPopup
          token={text}
          parentRef={parentRef}
          onClose={togglePopup}
        />
      )}
    </div>
  );
}

export default Ciyu;
