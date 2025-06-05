/**
 * @class AppError
 * @extends {Error}
 * @description 애플리케이션에서 사용되는 커스텀 에러 클래스
 * @property {number} statusCode - HTTP 상태 코드
 * @property {string} status - 에러 상태 ('fail' 또는 'error')
 * @property {boolean} isOperational - 운영 에러 여부를 나타내는 플래그
 */
class AppError extends Error {
    public readonly statusCode: number;
    public readonly status: string;
    public readonly isOperational: boolean;
  
    /**
     * @constructor
     * @param {string} message - 에러 메시지
     * @param {number} statusCode - HTTP 상태 코드
     */
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
      this.isOperational = true;
  
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  export default AppError; 