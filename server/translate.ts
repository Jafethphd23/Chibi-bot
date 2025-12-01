interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  isTranslated: boolean;
  detectedScript: string;
}

const translationCache = new Map<string, TranslationResult>();

// Unicode ranges for different scripts
const UNICODE_RANGES = {
  chineseKanji: { name: 'Chinese', min: 0x4e00, max: 0x9fff, code: 'zh' },
  hiragana: { name: 'Hiragana', min: 0x3040, max: 0x309f, code: 'ja' },
  katakana: { name: 'Katakana', min: 0x30a0, max: 0x30ff, code: 'ja' },
  hangul: { name: 'Hangul', min: 0xac00, max: 0xd7af, code: 'ko' },
  cyrillic: { name: 'Cyrillic', min: 0x0400, max: 0x04ff, code: 'ru' },
  latinExtended: { name: 'Latin', min: 0x0100, max: 0x017f, code: 'latin' },
  basic: { name: 'Basic Latin', min: 0x0041, max: 0x005a, code: 'en' },
};

// Script detection table
interface ScriptAnalysis {
  scripts: Map<string, number>;
  dominantScript: string;
  dominantLanguage: string;
}

function analyzeTextScript(text: string): ScriptAnalysis {
  const scripts = new Map<string, number>();
  let totalChars = 0;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    
    // Skip spaces and punctuation
    if (charCode <= 0x0020 || (charCode >= 0x0021 && charCode <= 0x002f)) {
      continue;
    }

    totalChars++;

    // Check which range this character belongs to
    if (charCode >= UNICODE_RANGES.chineseKanji.min && charCode <= UNICODE_RANGES.chineseKanji.max) {
      scripts.set('Chinese', (scripts.get('Chinese') || 0) + 1);
    } else if (charCode >= UNICODE_RANGES.hiragana.min && charCode <= UNICODE_RANGES.hiragana.max) {
      scripts.set('Hiragana', (scripts.get('Hiragana') || 0) + 1);
    } else if (charCode >= UNICODE_RANGES.katakana.min && charCode <= UNICODE_RANGES.katakana.max) {
      scripts.set('Katakana', (scripts.get('Katakana') || 0) + 1);
    } else if (charCode >= UNICODE_RANGES.hangul.min && charCode <= UNICODE_RANGES.hangul.max) {
      scripts.set('Hangul', (scripts.get('Hangul') || 0) + 1);
    } else if (charCode >= UNICODE_RANGES.cyrillic.min && charCode <= UNICODE_RANGES.cyrillic.max) {
      scripts.set('Cyrillic', (scripts.get('Cyrillic') || 0) + 1);
    } else if (charCode >= UNICODE_RANGES.latinExtended.min && charCode <= UNICODE_RANGES.latinExtended.max) {
      scripts.set('Latin', (scripts.get('Latin') || 0) + 1);
    } else if ((charCode >= 0x0041 && charCode <= 0x005a) || (charCode >= 0x0061 && charCode <= 0x007a)) {
      scripts.set('BasicLatin', (scripts.get('BasicLatin') || 0) + 1);
    }
  }

  // Find dominant script
  let dominantScript = 'Unknown';
  let dominantLanguage = 'unknown';
  let maxCount = 0;

  scripts.forEach((count, script) => {
    if (count > maxCount) {
      maxCount = count;
      dominantScript = script;
    }
  });

  // Map script to language code
  if (dominantScript === 'Chinese') dominantLanguage = 'zh';
  else if (dominantScript === 'Hiragana' || dominantScript === 'Katakana') dominantLanguage = 'ja';
  else if (dominantScript === 'Hangul') dominantLanguage = 'ko';
  else if (dominantScript === 'Cyrillic') dominantLanguage = 'ru';
  else dominantLanguage = 'unknown';

  return { scripts, dominantScript, dominantLanguage };
}

// Protected names that should not be translated
const PROTECTED_NAMES = ["Meme", "めめ"];
const PLACEHOLDER_PREFIX = "__PROTECTED_NAME_";

function replaceProtectedNames(text: string): { text: string; replacements: Map<string, string> } {
  const replacements = new Map<string, string>();
  let processedText = text;
  
  PROTECTED_NAMES.forEach((name, index) => {
    const placeholder = `${PLACEHOLDER_PREFIX}${index}__`;
    const regex = new RegExp(`\\b${name}\\b`, "gi");
    if (regex.test(processedText)) {
      processedText = processedText.replace(regex, placeholder);
      replacements.set(placeholder, name);
    }
  });
  
  return { text: processedText, replacements };
}

function restoreProtectedNames(text: string, replacements: Map<string, string>): string {
  let result = text;
  replacements.forEach((originalName, placeholder) => {
    result = result.replace(new RegExp(placeholder, "g"), originalName);
  });
  return result;
}

let lastRequestTime = 0;
// En producción (Render), Google es más estricto: usa 3s. En desarrollo: usa 2s
const MIN_REQUEST_INTERVAL = process.env.NODE_ENV === "production" ? 3500 : 2000;
const MAX_RETRIES = process.env.NODE_ENV === "production" ? 2 : 1;

async function rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
  
  // En producción, reintentar si recibe 429
  if (process.env.NODE_ENV === "production") {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        retries++;
        if (retries < MAX_RETRIES) {
          const waitTime = 5000 * retries; // 5s, 10s
          console.log(`[RATE LIMIT] 429 en producción. Esperando ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          return response;
        }
      } else {
        return response;
      }
    }
  }
  
  return fetch(url, options);
}

export async function translateMessage(
  text: string,
  targetLanguage: string
): Promise<TranslationResult> {
  const cacheKey = `${text}:${targetLanguage}`;
  const cached = translationCache.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] "${text}"`);
    return cached;
  }

  if (text.length < 2 || /^https?:\/\//.test(text)) {
    return {
      translatedText: text,
      detectedLanguage: "unknown",
      isTranslated: false,
      detectedScript: "none",
    };
  }
  
  // Check if message is only whitespace and punctuation (but allow Asian characters)
  const hasValidChars = /[a-zA-Z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff]/u.test(text);
  if (!hasValidChars) {
    return {
      translatedText: text,
      detectedLanguage: "unknown",
      isTranslated: false,
      detectedScript: "none",
    };
  }

  // Analyze the script of the input text
  const scriptAnalysis = analyzeTextScript(text);
  console.log(`[SCRIPT DETECTION] Text: "${text}", Dominant Script: ${scriptAnalysis.dominantScript}, Language: ${scriptAnalysis.dominantLanguage}`);
  console.log(`[SCRIPT TABLE] ${JSON.stringify(Array.from(scriptAnalysis.scripts.entries()))}`);

  try {
    console.log(`[TRANSLATING] "${text}" to ${targetLanguage}`);

    // Protect names from translation
    const { text: processedText, replacements } = replaceProtectedNames(text);

    // Build the request body with proper encoding for Asian languages
    const params = new URLSearchParams();
    params.append("client", "gtx");
    params.append("sl", "auto");
    params.append("tl", targetLanguage);
    params.append("dt", "t");
    params.append("q", processedText);

    const response = await rateLimitedFetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error(`[API ERROR] Status ${response.status}`);
      return {
        translatedText: text,
        detectedLanguage: "unknown",
        isTranslated: false,
        detectedScript: scriptAnalysis.dominantScript,
      };
    }

    const result = await response.json();
    let translatedText = result[0]?.[0]?.[0] || text;
    const apiDetectedLanguage = result[2] || "unknown";
    
    // Restore protected names
    translatedText = restoreProtectedNames(translatedText, replacements);
    
    console.log(`[API RESULT] API detected: "${apiDetectedLanguage}", Text changed: ${translatedText !== text}`);
    console.log(`[TRANSLATION RESULT] "${text}" -> "${translatedText}"`);
    
    // Normalize language codes
    const normalizedTarget = targetLanguage.split('-')[0].toLowerCase();
    const normalizedApiDetected = apiDetectedLanguage.split('-')[0].toLowerCase();
    
    // Decision: should we translate?
    // Main logic: if the API detected a different language than target, translate
    const shouldTranslate = normalizedApiDetected !== normalizedTarget && translatedText !== text;
    
    console.log(`[DECISION] API Detected: ${normalizedApiDetected}, Target: ${normalizedTarget}, Text changed: ${translatedText !== text}, Should Translate: ${shouldTranslate}`);

    const translation: TranslationResult = {
      translatedText,
      detectedLanguage: apiDetectedLanguage,
      isTranslated: shouldTranslate,
      detectedScript: scriptAnalysis.dominantScript,
    };

    translationCache.set(cacheKey, translation);
    return translation;
  } catch (error) {
    console.error(`[TRANSLATION ERROR]`, error);
    return {
      translatedText: text,
      detectedLanguage: "unknown",
      isTranslated: false,
      detectedScript: scriptAnalysis.dominantScript,
    };
  }
}

export function clearTranslationCache() {
  translationCache.clear();
}
