# 1. 베이스 이미지 선택
# 경량화된 공식 파이썬 3.10 이미지를 사용합니다.
FROM python:3.10-slim

# 2. 작업 디렉토리 설정
# 컨테이너 내부에서 코드가 위치하고 실행될 기본 폴더를 지정합니다.
WORKDIR /app

# 3. 의존성 파일 복사 및 설치
# requirements.txt만 먼저 복사해서 설치하면, 나중에 소스 코드만 변경되었을 때
# 매번 라이브러리를 다시 설치하지 않아 빌드 속도가 빨라짐 (Docker의 캐시 기능 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. 보안을 위한 non-root 사용자 생성
# root 사용자로 컨테이너를 실행하는 것은 보안상 위험함
# 별도의 사용자를 생성하고 그 사용자로 애플리케이션을 실행
RUN addgroup --system app && adduser --system --ingroup app app

# 5. 나머지 소스 코드 전체 복사
# .dockerignore 파일에 명시된 파일을 제외하고 모든 소스 코드를 복사
COPY . .

# 6. 사용자 전환
USER app

# 7. 서버가 실행될 포트 지정 (컨테이너 내부 포트)
EXPOSE 5000

# 8. 컨테이너가 시작될 때 실행할 명령어
# gunicorn을 사용해 app.py 파일 안에 있는 app 객체를 실행함
# FastAPI는 uvicorn 워커를 사용하도록 지정해야함
CMD gunicorn -k uvicorn.workers.UvicornWorker --bind "0.0.0.0:${PORT:-5000}" app:app
