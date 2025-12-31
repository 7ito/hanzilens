/**
 * Curated test sentences for model evaluation
 * 
 * Categories:
 * - basic: Common phrases, simple grammar
 * - homophone: Words with multiple readings (了, 得, 地, 着)
 * - tone-sandhi: Tone changes (不, 一)
 * - u-umlaut: Words with ü (女, 绿, 旅)
 * - compound: Multi-character compound words
 * - proper-noun: Names, places
 * - literary: Classical/formal Chinese
 * - mixed: Numbers, dates, mixed content
 * - slang: Internet slang, colloquialisms
 */

import type { TestSentence } from './types.js';

export const testSentences: TestSentence[] = [
  // ============================================
  // BASIC (8 sentences)
  // Common phrases, simple grammar
  // ============================================
  {
    id: 'basic-01',
    text: '你好吗？我很好。',
    category: 'basic',
    notes: 'Simple greeting exchange',
    expectedTranslation: 'How are you? I am fine.',
  },
  {
    id: 'basic-02',
    text: '今天天气很好。',
    category: 'basic',
    notes: 'Weather comment',
    expectedTranslation: 'The weather is nice today.',
  },
  {
    id: 'basic-03',
    text: '他是我的朋友。',
    category: 'basic',
    notes: 'Simple statement with 是',
    expectedTranslation: 'He is my friend.',
  },
  {
    id: 'basic-04',
    text: '我喜欢吃中国菜。',
    category: 'basic',
    notes: 'Preference with 喜欢',
    expectedTranslation: 'I like eating Chinese food.',
  },
  {
    id: 'basic-05',
    text: '请问，洗手间在哪里？',
    category: 'basic',
    notes: 'Polite question',
    expectedTranslation: 'Excuse me, where is the bathroom?',
  },
  {
    id: 'basic-06',
    text: '这本书很有意思。',
    category: 'basic',
    notes: 'Opinion with 有意思',
    expectedTranslation: 'This book is very interesting.',
  },
  {
    id: 'basic-07',
    text: '我每天早上六点起床。',
    category: 'basic',
    notes: 'Daily routine with time',
    expectedTranslation: 'I get up at six o\'clock every morning.',
  },
  {
    id: 'basic-08',
    text: '她在学校学习汉语。',
    category: 'basic',
    notes: 'Location + activity',
    expectedTranslation: 'She studies Chinese at school.',
  },

  // ============================================
  // HOMOPHONE (6 sentences)
  // Words with multiple readings
  // ============================================
  {
    id: 'homo-01',
    text: '他了解了情况。',
    category: 'homophone',
    notes: '了: liao3 (understand) vs le5 (aspect particle)',
    expectedTranslation: 'He understood the situation.',
  },
  {
    id: 'homo-02',
    text: '我得得到这个机会。',
    category: 'homophone',
    notes: '得: dei3 (must) vs de2 (obtain) vs de5 (complement marker)',
    expectedTranslation: 'I must get this opportunity.',
  },
  {
    id: 'homo-03',
    text: '她的地很干净。',
    category: 'homophone',
    notes: '的 (de5 possessive) vs 地 (di4 ground/floor)',
    expectedTranslation: 'Her floor is very clean.',
  },
  {
    id: 'homo-04',
    text: '他看着书睡着了。',
    category: 'homophone',
    notes: '着: zhe5 (continuous) vs zhao2 (fall asleep)',
    expectedTranslation: 'He fell asleep while reading.',
  },
  {
    id: 'homo-05',
    text: '这种种子很难种。',
    category: 'homophone',
    notes: '种: zhong3 (kind/seed) vs zhong4 (to plant)',
    expectedTranslation: 'This kind of seed is hard to plant.',
  },
  {
    id: 'homo-06',
    text: '银行在那个行里。',
    category: 'homophone',
    notes: '行: hang2 (row/profession) vs xing2 (okay/go)',
    expectedTranslation: 'The bank is in that row.',
  },

  // ============================================
  // TONE SANDHI (5 sentences)
  // Tone changes for 不 and 一
  // ============================================
  {
    id: 'sandhi-01',
    text: '我不是学生。',
    category: 'tone-sandhi',
    notes: '不 before 4th tone: bu2 shi4',
    expectedTranslation: 'I am not a student.',
  },
  {
    id: 'sandhi-02',
    text: '这不对，不好，不行。',
    category: 'tone-sandhi',
    notes: '不 tone changes: bu2 dui4, bu4 hao3, bu4 xing2',
    expectedTranslation: 'This is not right, not good, not okay.',
  },
  {
    id: 'sandhi-03',
    text: '我有一个苹果。',
    category: 'tone-sandhi',
    notes: '一 before 4th tone: yi2 ge4',
    expectedTranslation: 'I have an apple.',
  },
  {
    id: 'sandhi-04',
    text: '一起去一趟吧。',
    category: 'tone-sandhi',
    notes: '一 changes: yi4 qi3, yi2 tang4',
    expectedTranslation: 'Let\'s go together (make a trip).',
  },
  {
    id: 'sandhi-05',
    text: '一样不一样？',
    category: 'tone-sandhi',
    notes: '一样 yi2 yang4',
    expectedTranslation: 'Is it the same or not?',
  },

  // ============================================
  // U-UMLAUT (4 sentences)
  // Words with ü sound
  // ============================================
  {
    id: 'umlaut-01',
    text: '那个女孩很漂亮。',
    category: 'u-umlaut',
    notes: '女 nu:3',
    expectedTranslation: 'That girl is very pretty.',
  },
  {
    id: 'umlaut-02',
    text: '我喜欢绿色的树。',
    category: 'u-umlaut',
    notes: '绿 lu:4',
    expectedTranslation: 'I like green trees.',
  },
  {
    id: 'umlaut-03',
    text: '他是一位律师。',
    category: 'u-umlaut',
    notes: '律 lu:4',
    expectedTranslation: 'He is a lawyer.',
  },
  {
    id: 'umlaut-04',
    text: '我们去旅行吧。',
    category: 'u-umlaut',
    notes: '旅 lu:3',
    expectedTranslation: 'Let\'s go traveling.',
  },

  // ============================================
  // COMPOUND (6 sentences)
  // Multi-character compound words
  // ============================================
  {
    id: 'compound-01',
    text: '中华人民共和国成立于1949年。',
    category: 'compound',
    notes: 'Long proper noun compound',
    expectedTranslation: 'The People\'s Republic of China was founded in 1949.',
  },
  {
    id: 'compound-02',
    text: '我在机场等飞机。',
    category: 'compound',
    notes: '机场, 飞机 compound words',
    expectedTranslation: 'I am waiting for a plane at the airport.',
  },
  {
    id: 'compound-03',
    text: '电脑和手机都很重要。',
    category: 'compound',
    notes: '电脑, 手机 compound words',
    expectedTranslation: 'Computers and mobile phones are both important.',
  },
  {
    id: 'compound-04',
    text: '他在大学学习经济学。',
    category: 'compound',
    notes: '大学, 经济学 compound words',
    expectedTranslation: 'He studies economics at university.',
  },
  {
    id: 'compound-05',
    text: '这个问题很复杂。',
    category: 'compound',
    notes: '问题, 复杂 compound words',
    expectedTranslation: 'This problem is very complicated.',
  },
  {
    id: 'compound-06',
    text: '我们需要保护环境。',
    category: 'compound',
    notes: '保护, 环境 compound words',
    expectedTranslation: 'We need to protect the environment.',
  },

  // ============================================
  // PROPER NOUNS (4 sentences)
  // Names, places
  // ============================================
  {
    id: 'proper-01',
    text: '北京是中国的首都。',
    category: 'proper-noun',
    notes: '北京, 中国 place names',
    expectedTranslation: 'Beijing is the capital of China.',
  },
  {
    id: 'proper-02',
    text: '我在上海工作。',
    category: 'proper-noun',
    notes: '上海 place name',
    expectedTranslation: 'I work in Shanghai.',
  },
  {
    id: 'proper-03',
    text: '李白是唐朝的诗人。',
    category: 'proper-noun',
    notes: '李白, 唐朝 proper nouns',
    expectedTranslation: 'Li Bai was a poet of the Tang Dynasty.',
  },
  {
    id: 'proper-04',
    text: '孔子说过很多名言。',
    category: 'proper-noun',
    notes: '孔子 proper noun',
    expectedTranslation: 'Confucius said many famous quotes.',
  },

  // ============================================
  // LITERARY (4 sentences)
  // Classical/formal Chinese
  // ============================================
  {
    id: 'literary-01',
    text: '子曰：学而时习之，不亦说乎？',
    category: 'literary',
    notes: 'Classical Chinese from Analerta, 说 here is yue4 (pleased)',
    expectedTranslation: 'The Master said: "To learn and to practice, is this not a pleasure?"',
  },
  {
    id: 'literary-02',
    text: '温故而知新。',
    category: 'literary',
    notes: 'Classical idiom',
    expectedTranslation: 'Review the old to learn the new.',
  },
  {
    id: 'literary-03',
    text: '三人行，必有我师。',
    category: 'literary',
    notes: 'Classical proverb',
    expectedTranslation: 'Among three people walking, there must be one who can teach me.',
  },
  {
    id: 'literary-04',
    text: '知之为知之，不知为不知。',
    category: 'literary',
    notes: 'Classical wisdom about knowledge',
    expectedTranslation: 'To know what you know and know what you don\'t know, that is true knowledge.',
  },

  // ============================================
  // MIXED (6 sentences)
  // Numbers, dates, mixed content
  // ============================================
  {
    id: 'mixed-01',
    text: '今天是2024年12月31日。',
    category: 'mixed',
    notes: 'Full date with numbers',
    expectedTranslation: 'Today is December 31, 2024.',
  },
  {
    id: 'mixed-02',
    text: '我有3个苹果和5个橙子。',
    category: 'mixed',
    notes: 'Numbers with measure words',
    expectedTranslation: 'I have 3 apples and 5 oranges.',
  },
  {
    id: 'mixed-03',
    text: '他买了一台iPhone。',
    category: 'mixed',
    notes: 'English brand name',
    expectedTranslation: 'He bought an iPhone.',
  },
  {
    id: 'mixed-04',
    text: '这是第11集。',
    category: 'mixed',
    notes: 'Ordinal number 第',
    expectedTranslation: 'This is episode 11.',
  },
  {
    id: 'mixed-05',
    text: '会议在下午3点30分开始。',
    category: 'mixed',
    notes: 'Time expression',
    expectedTranslation: 'The meeting starts at 3:30 PM.',
  },
  {
    id: 'mixed-06',
    text: '我的电话号码是138-1234-5678。',
    category: 'mixed',
    notes: 'Phone number',
    expectedTranslation: 'My phone number is 138-1234-5678.',
  },

  // ============================================
  // SLANG (4 sentences)
  // Internet slang, colloquialisms
  // ============================================
  {
    id: 'slang-01',
    text: '这个视频太666了！',
    category: 'slang',
    notes: '666 internet slang for "awesome"',
    expectedTranslation: 'This video is so awesome!',
  },
  {
    id: 'slang-02',
    text: '他真的很牛。',
    category: 'slang',
    notes: '牛 slang for "awesome/impressive"',
    expectedTranslation: 'He is really impressive.',
  },
  {
    id: 'slang-03',
    text: '这个笑话太冷了。',
    category: 'slang',
    notes: '冷笑话 cold joke / bad pun',
    expectedTranslation: 'This joke is so lame.',
  },
  {
    id: 'slang-04',
    text: '别装了，你很菜。',
    category: 'slang',
    notes: '菜 slang for "bad at something"',
    expectedTranslation: 'Stop pretending, you\'re bad at this.',
  },
];

/**
 * Get sentences by category
 */
export function getSentencesByCategory(category: TestSentence['category']): TestSentence[] {
  return testSentences.filter(s => s.category === category);
}

/**
 * Get a subset of sentences for quick testing
 */
export function getQuickTestSentences(count: number = 10): TestSentence[] {
  // Return a diverse sample across categories
  const categories: TestSentence['category'][] = [
    'basic', 'homophone', 'tone-sandhi', 'u-umlaut', 
    'compound', 'proper-noun', 'literary', 'mixed', 'slang'
  ];
  
  const result: TestSentence[] = [];
  let categoryIndex = 0;
  
  while (result.length < count && result.length < testSentences.length) {
    const category = categories[categoryIndex % categories.length];
    const categorySentences = getSentencesByCategory(category);
    const alreadyAdded = result.filter(s => s.category === category).length;
    
    if (alreadyAdded < categorySentences.length) {
      result.push(categorySentences[alreadyAdded]);
    }
    
    categoryIndex++;
  }
  
  return result;
}
