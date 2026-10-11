# Production Dockerfile for BookMyTime
FROM python:3.11-slim

WORKDIR /app

# BookMyTime uses Python 3 standard library (no pip packages needed)
COPY . /app

# Environment variables
ENV PORT=8080
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python3", "server.py"]
