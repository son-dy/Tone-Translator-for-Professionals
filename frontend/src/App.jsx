import { useState, useEffect, useRef } from "react";
function App() {
  const [originalText, setOriginalText] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [style, setStyle] = useState("정중하고 요청하는 어투");
  const [keywords, setKeywords] = useState("");
  const [copyStatus, setCopyStatus] = useState("복사하기");
  const [isConverting, setIsConverting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const abortControllerRef = useRef(null);

  // '변환' 버튼 클릭 시 실행될 함수
  const handleConvert = async () => {
    const trimmedText = originalText.trim();
    if (!trimmedText) {
      // 원본 텍스트가 없으면 아무 작업도 하지 않음
      return;
    }

    // 이전 요청이 있다면 중단
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 각 작업에 대한 로딩 상태를 개별적으로 설정
    setIsConverting(true);
    setIsExtracting(true);
    setConvertedText("");
    setKeywords("키워드 추출 중...");

    const convertText = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

        const response = await fetch(`${baseUrl}/api/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ original_text: originalText, style }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setConvertedText((prev) => prev + chunk);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          // AbortError와 정상 스트림 종료 에러(Failed to read the response body)만 무시
          if (error.name !== "AbortError" && !error.message.includes("Failed to read the response body")) {
            console.error("Conversion Error:", error);
            setConvertedText("오류가 발생, 서버를 확인 바람");
          }
        }
      } finally {
        // 텍스트 변환이 끝나면 (성공하든 실패하든) 로딩 상태 해제
        setIsConverting(false);
      }
    };

    const extractKeywords = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

        const keywordResponse = await fetch(`${baseUrl}/api/keywords`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmedText }),
          signal: controller.signal,
        });
        if (!keywordResponse.ok) {;
        const { keywords } = await keywordResponse.json();
        setKeywords(keywords);
        return;
      }
      const {keywords} = await keywordResponse.json();
      setKeywords(keywords); 
    } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Keyword Extraction Error:", error);
          setKeywords("키워드 추출 실패");
        }
      } finally {
        // 키워드 추출이 끝나면 로딩 상태 해제
        setIsExtracting(false);
      }
    };

    Promise.all([convertText(), extractKeywords()]); 
  };

  // 스타일이 변경될 때 자동으로 변환되도록 useEffect 유지
  useEffect(() => {
    if (originalText.trim()) {
      handleConvert();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // 전체 로딩 상태 (하나라도 로딩 중이면 true)
  const isLoading = isConverting || isExtracting;

  const handleCopy = () => {
    if (!convertedText || copyStatus !== "복사하기") return;

    navigator.clipboard.writeText(convertedText).then(() => {
      setCopyStatus("복사 완료!");
      setTimeout(() => setCopyStatus("복사하기"), 2000);
    }).catch(err => {
      console.error('클립보드 복사 실패:', err);
      setCopyStatus("복사 실패");
      setTimeout(() => setCopyStatus("복사하기"), 2000);
    });
  };

  const handleSave = () => {
    if (!convertedText) return;
    const blob = new Blob([convertedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; 
    link.download = '변환된_텍스트.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    // originalText를 비우면 useEffect가 트리거되어 모든 상태가 초기화
    setOriginalText("");
    setConvertedText("");
    setKeywords("");
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-indigo-100 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-indigo-200/50 p-8 border border-indigo-100">
        <h1 className="text-4xl font-extrabold text-center text-indigo-800 mb-10 tracking-tight">
          💼 업무용 말투 변환기
        </h1>

        {/* 스타일 선택 */}
        <div className="mb-10 p-5 bg-indigo-50/70 rounded-2xl border border-indigo-200 shadow-inner flex items-center gap-4">
          <label
            htmlFor="style"
            className="font-semibold text-indigo-700 whitespace-nowrap"
          >
            변환 스타일:
          </label>
          <select
            id="style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full p-3 rounded-xl border border-indigo-300 focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm transition-all"
          >
            <option value="정중하고 요청하는 어투">정중하고 요청하는 어투</option>
            <option value="간결하고 명확한 보고 어투">간결하고 명확한 보고 어투</option>
            <option value="긍정적이고 부드러운 어투">긍정적이고 부드러운 어투</option>
          </select>
        </div>

        {/* 핵심 키워드 (중앙 상단) */}
        {(keywords || isExtracting || isConverting) && (
          <div className="mb-6 p-4 bg-indigo-50/50 border border-indigo-200 rounded-2xl shadow-sm text-center">
            <h4 className="text-xs font-bold text-indigo-500 uppercase mb-2 tracking-wide">
              핵심 키워드
            </h4>
            {isExtracting ? (
              <div className="h-5 flex justify-center items-center"><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div></div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap h-5">{keywords}</p>
            )}
          </div>
        )}

        {/* 저장 및 복사 버튼 */}
        <div className="flex justify-center gap-4 mb-10">
          <button
            onClick={handleSave}
            disabled={!convertedText || isConverting}
            className="px-5 py-2 text-sm font-semibold text-indigo-700 bg-white border border-indigo-300 rounded-lg shadow-sm hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            파일로 저장
          </button>
          <button
            onClick={handleCopy}
            disabled={!convertedText || isConverting}
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {copyStatus}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6 md:gap-10">
          {/* 원본 텍스트 */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-8 mb-3">
              <h3 className="text-sm font-bold text-indigo-600 tracking-wider uppercase">
                원본 텍스트
              </h3>
              {originalText && (
                <button
                  onClick={handleReset}
                  className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors shadow-sm"
                >
                  초기화
                </button>
              )}
            </div>
            <textarea
              rows="12"
              placeholder="여기에 변환할 내용을 입력하세요..."
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              className="w-full p-4 border-2 border-indigo-200 rounded-2xl resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-md bg-white/70 backdrop-blur-sm transition-all hover:shadow-lg"
            />
          </div>

          {/* 변환 버튼 (중앙) */}
          <div className="flex justify-center">
            <button
              onClick={handleConvert}
              disabled={!originalText || isConverting}
              className="w-28 h-12 flex items-center justify-center gap-2 rounded-full bg-indigo-600 text-white font-semibold shadow-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              {isConverting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>변환</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </>
              )}
            </button>
          </div>

          {/* 변환 결과 */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-8 mb-3">
              <h3 className="text-sm font-bold text-indigo-600 tracking-wider uppercase">
                변환 결과
              </h3>
              {isConverting && (
                <button
                  onClick={() => abortControllerRef.current?.abort()}
                  className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors shadow-sm"
                >
                  중단
                </button>
              )}
            </div>
            <textarea
              rows="12"
              readOnly
              value={convertedText}
              placeholder={isConverting && !convertedText ? "변환 중..." : "변환 결과가 여기에 표시됩니다..."}
              className={`w-full p-4 border-2 border-indigo-100 rounded-2xl resize-none bg-indigo-50/40 backdrop-blur-sm shadow-inner text-gray-700 transition-all ${isConverting && !convertedText ? 'animate-pulse' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
