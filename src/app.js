// rag-doc-analyzer
const express = require('express');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');
const readline = require('readline');
require('dotenv').config();

// Routes
const uploadRoute = require('./routes/upload');

const app = express();
const PORT = 3000;
const DOCS_DIR = path.join(__dirname, 'docs');

// OpenAI init
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use('/upload', uploadRoute);

//Utility Functions
async function extractTextFromPDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

function extractTextFromTXT(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const lines = text.split('\n');
  const chunks = [];

  for (let i = 0; i < lines.length;) {
    let chunk = '';
    let j = i;

    while (
      j < lines.length &&
      lines[j] !== undefined && 
      chunk.length + lines[j].length < chunkSize
    ) {
      chunk += lines[j] + '\n';
      j++;
    }

    chunks.push(chunk.trim());

    if (j >= lines.length) break;

    const lastLineLength = lines[j - 1] ? lines[j - 1].length : 1;
    const backtrackLines = Math.floor(overlap / lastLineLength);
    i = Math.max(j - backtrackLines, i + 1); 
  }

  return chunks;
}


async function loadDocuments() {
  const files = fs.readdirSync(DOCS_DIR);
  const chunks = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const filePath = path.join(DOCS_DIR, file);
    let text = '';

    if (ext === '.pdf') {
      text = await extractTextFromPDF(filePath);
    } else if (ext === '.txt') {
      text = extractTextFromTXT(filePath);
    } else {
      continue;
    }

    const splitChunks = splitIntoChunks(text);
    for (const chunk of splitChunks) {
      chunks.push([chunk, file]);
    }
  }

  return chunks;
}

async function generateAnswer(contextChunks, query) {
  const fileText = contextChunks.map(([text, filename]) =>
    `---\nFrom file: ${filename}\n${text}`).join('\n');

  const prompt = [
    'You are a smart assistant that extracts structured information from given docs.',
    'Use only the context provided below to answer the user\'s question.',
    'If a project spans across multiple sections or lines, combine them into a complete description.',
    'Always respond in strict JSON format based on the question asked.',
    'If the answer is not available, return the value as `null`.',
    'Example format:',
    '{\n  "field1": "value or null",\n  "field2": "value or null"\n}',
    fileText,
    `\nQuestion: ${query}`,
    'Answer in JSON:'
  ].join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 500,
    temperature: 0.3
  });

  return completion.choices[0].message.content.trim();
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  startQnA();
});

//  Terminal Q&A 
async function startQnA() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function ask() {
    rl.question('\nUser Query (type "exit" to quit): ', async (query) => {
      if (query.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      const chunks = await loadDocuments();
      const topChunks = chunks.slice(0, 10);
      const answer = await generateAnswer(topChunks, query);
      console.log('\nAnswer:\n' + answer + '\n' + '='.repeat(50));
      ask();
    });
  }

  ask();
}
