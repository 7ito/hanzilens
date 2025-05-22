import { useState, useRef, useEffect } from "react";

const ZWSP = "\u200B";

const EditableDiv = ({
  initialValue = "",
  onTextChange,
  placeholder,
  onEnterPress,
  editableStyle = "flex items-center justify-center w-full h-full p-4 text-xl lg:text-4xl text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 leading-normal resize-none whitespace-pre-wrap break-all",
  placeholderStyle = "absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 text-[#acafb3] text-xl lg:text-4xl text-center pointer-events-none",
}) => {
  const editableRef = useRef(null);
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;

    const isEmpty = !initialValue || initialValue === ZWSP;

    if (isEmpty) {
      el.textContent = ZWSP;
      setShowPlaceholder(true);
    } else {
      el.textContent = initialValue;
      setShowPlaceholder(false);
    }
  }, [initialValue]);

  useEffect(() => {
    const el = editableRef.current;
    if (!el || !onEnterPress) return;

    const handleKeyDown = (e) => {
      if (document.activeElement === el & e.key === 'Enter') {
        e.preventDefault();
        onEnterPress();
      }
    }

    el.addEventListener('keydown', handleKeyDown);

    return () => {
      el.removeEventListener('keydown', handleKeyDown);
    }
  }, [onEnterPress]); 

  const setCaretAfterZWSP = (el) => {
    if (!el || !el.firstChild) return;
    const range = document.createRange();
    const sel = window.getSelection();

    if (sel) {
      range.setStart(el.firstChild, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const handleInput = (e) => {
    const el = e.currentTarget;
    let currentText = el.textContent;
    let resText = "";

    if (currentText === "") {
      el.textContent = ZWSP;
      setCaretAfterZWSP(el);
      setShowPlaceholder(true);
      resText = "";
    } else if (currentText === ZWSP) {
      setShowPlaceholder(true);
      resText = "";
    } else {
      setShowPlaceholder(false);
      if (currentText.startsWith(ZWSP)) {
        resText = currentText.substring(1);
      } else {
        resText = currentText;
      }

      resText = resText.replace(new RegExp(ZWSP, "g"), "");

      if (resText === "") {
        el.textContent = ZWSP;
        setCaretAfterZWSP(el);
        setShowPlaceholder(true);
      }
    }

    if (onTextChange) {
      onTextChange(resText);
    }
  };

  const handleFocus = (e) => {
    const el = e.currentTarget;

    requestAnimationFrame(() => {
      if (el && window.getSelection) {
        const selection = window.getSelection();
        const range = document.createRange();

        if (el.textContent === ZWSP && el.firstChild) {
          range.setStart(el.firstChild, 1);
          range.collapse(true);
        } else {
          range.selectNodeContents(el);
          range.collapse(false);
        }

        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });
  };

  return (
    <div className="relative w-full h-full p-1">
      <div
        ref={editableRef}
        className={editableStyle}
        onInput={handleInput}
        onFocus={handleFocus}
        contentEditable="plaintext-only"
        suppressContentEditableWarning={true}
      ></div>
      {showPlaceholder && placeholder && (
        <div className={placeholderStyle}>{placeholder}</div>
      )}
    </div>
  );
};

export default EditableDiv;
