import OpenAI from 'openai';
import { DCPost } from '../types/crawler.types';

export class TrendAnalyzer {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * 크롤링된 게시물들의 트렌드를 분석합니다.
   * @param posts 분석할 게시물 배열
   * @returns 트렌드 분석 결과
   */
  async analyzeTrends(posts: DCPost[]): Promise<{
    keywords: string[];
    summary: string;
    topics: { topic: string; count: number }[];
    sentiment: string;
  }> {
    const postsText = posts.map(post => `
제목: ${post.title}
내용: ${post.content || '내용 없음'}
댓글: ${post.comments?.map(c => c.content).join(' | ') || '댓글 없음'}
`).join('\n---\n');

    const prompt = `
다음은 디시인사이드의 실시간 인기 게시물들입니다. 이 게시물들을 분석하여 다음 정보를 JSON 형식으로 제공해주세요:

1. keywords: 자주 등장하는 주요 키워드 (배열, 최대 10개)
2. summary: 전반적인 트렌드에 대한 간단한 요약 (1-2문장)
3. topics: 주요 토픽들과 각각의 언급 빈도 (배열)
4. sentiment: 전반적인 정서 (긍정/부정/중립 중 하나)

분석할 게시물:
${postsText}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '게시물의 트렌드를 분석하는 전문가입니다. JSON 형식으로 분석 결과를 제공합니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('GPT API 응답에 content가 없습니다.');
      }

      const result = JSON.parse(content);
      return result;
    } catch (error) {
      console.error('트렌드 분석 중 오류 발생:', error);
      throw new Error('트렌드 분석에 실패했습니다.');
    }
  }
} 