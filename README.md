# Media to Text

Транскрибация аудио и видео файлов в текст с распознаванием спикеров.

## Требования

- Node.js
- ffmpeg (для обработки медиафайлов)
- API ключ AssemblyAI

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Установите ffmpeg (если не установлен):
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

3. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

4. Добавьте ваш API ключ AssemblyAI в `.env`:
```
ASSEMBLYAI_API_KEY=your_api_key_here
```

## Получение API ключа

Зарегистрируйтесь и получите ключ на сайте AssemblyAI:
https://www.assemblyai.com/dashboard/signup

## Использование

1. Положите медиафайлы в папку `media/`
2. Запустите:
```bash
npm run build && node dist/index.js
```

Результат появится в папке `media/` в виде `.txt` файлов.

## Поддерживаемые форматы

`.mp3`, `.mp4`, `.mpeg`, `.mpga`, `.m4a`, `.wav`, `.webm`, `.ogg`, `.flac`

## Настройки

В `.env` можно настроить:
- `CHUNK_DURATION_SEC` - длительность чанка в секундах (по умолчанию 300)
- `PARALLEL_REQUESTS` - количество параллельных запросов (по умолчанию 3)
