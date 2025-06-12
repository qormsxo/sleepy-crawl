import OpenAI from 'openai';
import { DCPost } from '../types/crawler.types';

interface TrendAnalysisResult {
  summary: string;
  sentiment: string;
}

export class TrendAnalyzer {
  private openai: OpenAI;
  private readonly MAX_GROUP_SIZE = 3; // 최대 그룹 크기
  private readonly TOKEN_LIMIT = 16000; // 여유를 두고 설정
  private readonly TOKENS_PER_CHARACTER = 2; // 한글 기준 대략적인 토큰 비율

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * 텍스트의 대략적인 토큰 수를 계산합니다.
   * @param text 계산할 텍스트
   * @returns 예상 토큰 수
   */
  private estimateTokenCount(text: string): number {
    return text.length * this.TOKENS_PER_CHARACTER;
  }

  /**
   * 주어진 게시물들의 적절한 그룹 크기를 계산합니다.
   * @param posts 게시물 배열
   * @returns 적절한 그룹 크기
   */
  private calculateOptimalGroupSize(posts: DCPost[]): number {
    // 샘플 게시물로 토큰 수 계산
    const samplePost = posts[0];
    const sampleText = `
제목: ${samplePost.title}
내용: ${samplePost.content || '내용 없음'}
댓글: ${samplePost.comments?.map(c => c.content).join(' | ') || '댓글 없음'}
`;
    
    const tokensPerPost = this.estimateTokenCount(sampleText);
    console.log(`예상 게시물당 토큰 수: ${tokensPerPost}`);

    // 시스템 프롬프트와 기본 지시문의 토큰 수를 고려
    const baseTokens = 500;
    const availableTokens = this.TOKEN_LIMIT - baseTokens;
    
    // 적절한 그룹 크기 계산
    let groupSize = Math.floor(availableTokens / tokensPerPost);
    
    // 최대/최소 그룹 크기 제한
    groupSize = Math.min(groupSize, this.MAX_GROUP_SIZE);
    groupSize = Math.max(groupSize, 1);

    console.log(`선택된 그룹 크기: ${groupSize}개`);
    return groupSize;
  }

  /**
   * 게시물 배열을 지정된 크기의 그룹으로 나눕니다.
   * @param posts 전체 게시물 배열
   * @returns 게시물 그룹 배열
   */
  private splitIntoGroups(posts: DCPost[]): DCPost[][] {
    const groupSize = this.calculateOptimalGroupSize(posts);
    const groups: DCPost[][] = [];
    for (let i = 0; i < posts.length; i += groupSize) {
      groups.push(posts.slice(i, i + groupSize));
    }
    return groups;
  }

  /**
   * 여러 분석 결과를 하나로 통합합니다.
   * @param results 그룹별 분석 결과 배열
   * @returns 통합된 분석 결과
   */
  private mergeResults(results: TrendAnalysisResult[]): TrendAnalysisResult {
    try {
      // 모든 요약문 수집 (빈 요약이나 '분석 실패' 제외)
      const allSummaries = results
        .map(r => r.summary)
        .filter(summary => summary && summary !== '분석 실패')
        .join('\n');

      // 모든 감정 수집
      const allSentiments = results
        .map(r => r.sentiment)
        .filter(s => s && ['긍정', '부정', '중립'].includes(s));

      return {
        summary: allSummaries || '분석 실패',
        sentiment: allSentiments.length > 0 ? allSentiments[0] : '중립'
      };
    } catch (error) {
      console.error('결과 병합 중 오류 발생:', error);
      return {
        summary: '분석에 실패했습니다.',
        sentiment: '중립'
      };
    }
  }

  /**
   * 단일 그룹의 게시물들을 분석합니다.
   * @param posts 분석할 게시물 그룹
   * @returns 분석 결과
   */
  private async analyzeGroup(posts: DCPost[]): Promise<TrendAnalysisResult> {
    // 게시물 내용 길이 제한
    const truncateText = (text: string, maxLength: number) => {
      if (!text) return '';
      return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    };

    // 댓글 수 제한 및 길이 제한
    const MAX_COMMENTS = 3;
    const MAX_TITLE_LENGTH = 100;
    const MAX_CONTENT_LENGTH = 500;
    const MAX_COMMENT_LENGTH = 100;

    posts.forEach((post, index) => {
      console.log(`\n[게시물 ${index + 1}]`);
      console.log(`제목: ${post.title}`);
      console.log(`내용 길이: ${post.content?.length || 0}자`);
      console.log(`댓글 수: ${post.comments?.length || 0}개`);
    });

    const postsText = posts.map(post => {
      const truncatedComments = (post.comments || [])
        .slice(0, MAX_COMMENTS)
        .map(c => truncateText(c.content, MAX_COMMENT_LENGTH));

      return `
제목: ${truncateText(post.title, MAX_TITLE_LENGTH)}
내용: ${truncateText(post.content || '내용 없음', MAX_CONTENT_LENGTH)}
댓글: ${truncatedComments.join(' | ') || '댓글 없음'}
`;
    }).join('\n---\n');

    const prompt = `
다음 게시물들의 전반적인 분위기를 분석하여 정확히 아래 형식의 JSON으로만 응답하세요:

{
  "summary": "전반적인 내용과 분위기를 한 문장에서 두 문장으로 요약",
  "sentiment": "긍정"
}

규칙:
1. summary는 게시물들의 주요 내용 및 댓글을 분석하고 요약을 한 문장에서 두 문장으로 작성
2. sentiment는 "긍정", "부정", "중립" 중 하나만 사용
3. 비속어나 욕설 포함 여부는 언급하지 말 것
4. 게시물의 형식이나 문법적 특성은 언급하지 말 것
5. 단순히 내용과 분위기만 객관적으로 분석할 것
6. summary 작성 시 아래 형식을 따라주세요:
   - 첫 문장: "[주제/이슈]에 대한 [의견/반응]이 [상태/분위기]를 보이고 있습니다."
   - 두 번째 문장: "[구체적인 내용/사례]가 [반응/영향]을 주고 있습니다."
   - "게시물들은", "~에 대해", "~에 관한" 같은 표현은 사용하지 말 것
   - "현재", "특히" 같은 접속어는 사용하지 말 것

분석할 게시물:
${postsText}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '게시물들의 전반적인 내용과 분위기만 객관적으로 분석하여 JSON 형식으로 응답하세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message.content;
      console.log('\n=== GPT 응답 ===\n', content, '\n================\n');

      if (!content) {
        throw new Error('GPT API 응답에 content가 없습니다.');
      }

      try {
        const result = JSON.parse(content.trim());
        
        // 응답 형식 검증 및 보정
        return {
          summary: typeof result.summary === 'string' ? result.summary : '분석 실패',
          sentiment: ['긍정', '부정', '중립'].includes(result.sentiment) ? result.sentiment : '중립'
        };
      } catch (parseError) {
        console.error('JSON 파싱 에러. 응답 내용:', content);
        return {
          summary: '분석에 실패했습니다.',
          sentiment: '중립'
        };
      }
    } catch (error) {
      console.error(`그룹 분석 중 오류 발생 (${posts.length}개 게시물):`, error);
      throw error;
    }
  }

  /**
   * 크롤링된 게시물들의 트렌드를 분석합니다.
   * 게시물들을 그룹으로 나누어 분석한 후 결과를 통합합니다.
   * @param posts 분석할 게시물 배열
   * @returns 트렌드 분석 결과
   */
  async analyzeTrends(posts: DCPost[]): Promise<TrendAnalysisResult> {
    try {
      console.log(`총 게시물 수: ${posts.length}개`);
      
      // 게시물을 그룹으로 나누기
      const groups = this.splitIntoGroups(posts);
      console.log(`그룹 수: ${groups.length}개 (그룹당 최대 ${this.MAX_GROUP_SIZE}개 게시물)\n`);
      
      // 각 그룹 분석
      const groupResults = await Promise.all(
        groups.map(group => this.analyzeGroup(group))
      );

      // 결과 통합
      const result = this.mergeResults(groupResults);
      
      console.log('\n[트렌드 분석 완료]');
      return result;
    } catch (error) {
      console.error('트렌드 분석 중 오류 발생:', error);
      throw new Error('트렌드 분석에 실패했습니다.');
    }
  }
} 