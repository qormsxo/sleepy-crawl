import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';

/**
 * 유효성 검사 에러를 처리하는 함수
 * @param {any} err - ValidationError 객체
 * @returns {AppError} 포맷된 에러 객체
 * @example
 * // 필수 필드가 누락된 경우
 * handleValidationError({ errors: { name: { message: '이름은 필수 항목입니다.' } } })
 */
const handleValidationError = (err: any) => {
  const errors = Object.values(err.errors).map((el: any) => el.message);
  const message = `유효하지 않은 입력 데이터. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

/**
 * OpenAI API 에러를 처리하는 함수
 * @param {any} err - OpenAI API 에러 객체
 * @returns {AppError} 포맷된 에러 객체
 */
const handleOpenAIError = (err: any) => {
  if (err.code === 'context_length_exceeded') {
    return new AppError('분석할 데이터가 너무 큽니다. 데이터 크기를 줄여주세요.', 400);
  }
  if (err.type === 'invalid_request_error') {
    return new AppError('잘못된 API 요청입니다.', 400);
  }
  return new AppError('AI 분석 중 오류가 발생했습니다.', 500);
};

const sendError = (err: AppError, res: Response) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
    return;
  }

  // 예상치 못한 에러인 경우
  console.error('ERROR 💥', err);
  res.status(500).json({
    status: 'error',
    message: '서버 오류가 발생했습니다.'
  });
};

/**
 * 글로벌 에러 처리 미들웨어
 * @param {any} err - 에러 객체
 * @param {Request} req - Express Request 객체
 * @param {Response} res - Express Response 객체
 * @param {NextFunction} next - Express NextFunction
 * @description
 * 애플리케이션에서 발생하는 모든 에러를 처리하는 미들웨어입니다.
 * 각 에러 타입에 따라 적절한 에러 메시지를 생성합니다.
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = { ...err };
  error.message = err.message;

  // 유효성 검사 에러 처리
  if (error.name === 'ValidationError') {
    error = handleValidationError(error);
  }
  
  // OpenAI API 에러 처리
  if (error.type === 'invalid_request_error' || error.code === 'context_length_exceeded') {
    error = handleOpenAIError(error);
  }

  sendError(error, res);
}; 