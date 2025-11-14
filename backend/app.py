from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import AsyncGenerator
import os
import google.generativeai as genai
from dotenv import load_dotenv
import ollama

# .env 파일에서 환경 변수 로드
load_dotenv()

# FastAPI 앱 생성
app = FastAPI()

# API 키 및 모델 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다, env 파일을 확인")
genai.configure(api_key=GEMINI_API_KEY)

# 사용할 모델 
GEMINI_MODEL_NAME = "gemini-2.5-flash" # 속도에 최적화된 모델로 변경하여 테스트
OLLAMA_MODEL_NAME = "exaone3.5:2.4b" # 키워드 추출용 로컬 모델

# LLM 클라이언트 초기화
ollama_client = ollama.AsyncClient()

# CORS 설정 
# 현재 React 개발 서버 주소인 http://localhost:5173 등을 추가
# 프론트엔드에서 오는 요청을 허용
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # 모든 HTTP 메소드 허용
    allow_headers=["*"], # 모든 HTTP 헤더 허용
)

# 요청 본문을 위한 Pydantic 모델 정의
# 프론트엔드에서 보내는 데이터 형식에 맞게 수정
class TextRequest(BaseModel):
    original_text: str = Field(..., description="변환할 원본 텍스트")
    style: str = Field(..., description="변환할 스타일")

class KeywordRequest(BaseModel):
    text: str = Field(..., description="키워드를 추출할 텍스트")

# 루트 엔드포인트
@app.get("/")
def read_root():
    return {"message": "Python 백엔드 서버가 실행 중"}

async def convert_tone_with_gemini_stream(text: str, style: str) -> AsyncGenerator[str, None]:
    """
    Gemini API를 사용하여 주어진 텍스트를 지정된 스타일의 업무용 톤으로 변환하고,
    결과를 스트리밍으로 반환합니다.
    """
    # LLM에게 역할을 부여하고 명확한 지시를 내리는 프롬프트
    prompt = f"""[역할]
당신은 뛰어난 비즈니스 커뮤니케이션 전문가입니다. 사용자의 평상시 말투를 비즈니스 상황에 적합한 톤으로 변환하는 임무를 맡고 있습니다.

[지시]
1. 사용자가 입력한 '원본 텍스트'를 분석하여 핵심 의미를 파악합니다.
2. 요청된 '{style}'에 맞춰 문장을 자연스럽고 전문적인 비즈니스 어투로 변환합니다.
3. 변환된 문장 외에 다른 설명이나 인사말을 절대 추가하지 마세요.

[변환 예시]
* 스타일: 정중하고 요청하는 어투
* 원본: 이거 오늘까지 해주세요.
* 변환: 혹시 괜찮으시다면, 이 업무를 오늘까지 마무리해 주실 수 있을까요?

* 스타일: 정중하고 요청하는 어투
* 원본: 파일 보내주세요~
* 변환: 안녕하세요, 요청드린 파일 전달 부탁드립니다.

[변환 시작]
* 스타일: {style}
* 원본: {text}
* 변환: """

    try:
        # Gemini 모델 생성 및 스트리밍 응답 생성
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        response_stream = await model.generate_content_async(prompt, stream=True)

        async for chunk in response_stream:
            # 응답에 텍스트가 있는 경우에만 전송
            if chunk.text:
                yield chunk.text
    except Exception as e:
        print(f"Gemini API 호출 중 오류 발생: {e}")
        yield "오류가 발생했습니다. 서버 로그를 확인해주세요."

async def extract_keywords_with_ollama(text: str) -> str:
    """Ollama를 사용하여 주어진 텍스트에서 핵심 키워드를 추출합니다."""
    if not text.strip():
        return ""

    # 모델이 역할을 더 잘 이해하고 좋은 품질의 키워드를 생성하도록 프롬프트를 개선합니다.
    prompt = f"""[역할]
당신은 주어진 텍스트의 핵심 내용을 파악하여 명사형 키워드로 요약하는 전문가입니다.

[지시]
1. 아래 '텍스트'의 핵심 내용을 나타내는 키워드를 5개 이내로 추출하세요.
2. 각 키워드는 쉼표(,)로 구분된 하나의 목록으로 만드세요.
3. 키워드 외에 다른 설명이나 줄바꿈을 절대 추가하지 마세요.

[추출 예시]
* 텍스트: 김 대리님, 어제 논의했던 자료 관련하여, 혹시 오늘 오후 3시까지 전달해 주실 수 있는지 여쭤봅니다.
* 키워드: 자료 요청, 김 대리, 마감 기한, 사전 검토

[텍스트]
{text}

[키워드]
"""
    # 매번 클라이언트를 생성하는 대신, 앱 시작 시 생성된 클라이언트를 재사용하여 성능을 향상
    response = await ollama_client.chat(
        model=OLLAMA_MODEL_NAME,
        messages=[{'role': 'user', 'content': prompt}]
    )
    return response['message']['content'].strip()

# 스트리밍 텍스트 변환을 위한 API 엔드포인트
# 프론트엔드에서 호출하는 경로(/api/convert)에 맞게 수정
@app.post("/api/convert")
async def convert_api(request: TextRequest):
    """Gemini를 사용하여 텍스트 변환을 스트리밍으로 제공하는 API"""
    return StreamingResponse(convert_tone_with_gemini_stream(request.original_text, request.style), media_type="text/event-stream")

# 키워드 추출을 위한 API 엔드포인트
@app.post("/api/keywords")
async def keywords_api(request: KeywordRequest):
    """Ollama를 사용하여 텍스트에서 키워드를 추출하는 API"""
    keywords = await extract_keywords_with_ollama(request.text)
    return {"keywords": keywords}

# python app.py으로 직접 실행할 때 uvicorn 서버를 구동하기 위한 코드
if __name__ == "__main__":
    import uvicorn
    # reload=True는 코드 변경 시 서버를 자동 재시작하는 개발용 옵션임
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
