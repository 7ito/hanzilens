import { expect, test } from '@playwright/test';

const INPUT_TEXT =
  '第60届奥斯卡金像奖是美国电影艺术与科学学院旨在奖励1987年最优秀电影的一场晚会，于太平洋时区1988年4月11日下午18点在美国加利福尼亚州洛杉矶的神殿礼堂举行，共计颁发了22座奥斯卡金像奖。晚会通过美国广播公司在美国直播，小塞缪尔·戈尔德温担任制片人，马蒂·帕赛塔导演，男演员切维·切斯连续第二年担任主持人。《末代皇帝》赢得最佳影片奖，并为贝纳尔多·贝托鲁奇拿下导演奖。';

function toSseDataLine(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

function buildParseSseBody(sentence: string): string {
  const sentencePreview = sentence.slice(0, 16);
  const translationText = `Final streaming translation: ${sentencePreview}`;
  const payload = {
    translation: translationText,
    segments: [{ id: 0, token: '第', pinyin: 'dì', definition: 'ordinal prefix' }],
    translationParts: [{ text: translationText, segmentIds: [0] }],
  };

  const finalJson = JSON.stringify(payload);
  const splitMarker = ',"segmentIds"';
  const splitIndex = finalJson.indexOf(splitMarker);
  const firstChunk =
    splitIndex > 0
      ? finalJson.slice(0, splitIndex)
      : finalJson.slice(0, Math.floor(finalJson.length * 0.7));
  const secondChunk = finalJson.slice(firstChunk.length);

  return `${toSseDataLine(firstChunk)}${toSseDataLine(secondChunk)}data: [DONE]\n`;
}

test('paragraph streaming handles partial translation parts without crashing', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  await page.addInitScript(() => {
    localStorage.setItem('hanzilens-has-visited', 'true');
  });

  let parseRequestCount = 0;
  await page.route('**/parse', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
      return;
    }

    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    parseRequestCount += 1;

    const body = route.request().postDataJSON() as { sentence?: string } | null;
    const sentence = typeof body?.sentence === 'string' ? body.sentence : 'unknown sentence';

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
      body: buildParseSseBody(sentence),
    });
  });

  await page.goto('/');

  await page.getByRole('textbox').fill(INPUT_TEXT);
  await page.getByRole('button', { name: 'Go' }).click();

  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(page.getByText('Sentences')).toBeVisible();
  await expect.poll(() => parseRequestCount).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: 'Translation' }).click();
  await expect(page.getByText(/Final streaming translation:/).first()).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  expect(pageErrors).toHaveLength(0);
});
