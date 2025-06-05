/**
 * HTTP 응답의 상태를 나타내는 타입
 * @readonly
 */
export type ResponseStatus = 'success' | 'fail' | 'error';

/**
 * 기본 에러 응답 형식
 * @interface
 */
export interface ErrorResponse {
  /** 응답 상태 */
  status: ResponseStatus;
  /** 에러 메시지 */
  message: string;
}

/**
 * 유효성 검사 에러 객체
 * @interface
 */
export interface ValidationError {
  /** 유효성 검사 에러 목록 */
  errors: {
    [field: string]: {
      /** 에러 메시지 */
      message: string;
    };
  };
}

/**
 * 페이지네이션 정보
 * @interface
 */
export interface PaginationInfo {
  /** 현재 페이지 번호 */
  page: number;
  /** 페이지당 항목 수 */
  limit: number;
  /** 전체 항목 수 */
  totalItems: number;
  /** 전체 페이지 수 */
  totalPages: number;
}

/**
 * 페이지네이션이 포함된 응답 형식
 * @interface
 * @template T - 응답 데이터의 타입
 */
export interface PaginatedResponse<T> {
  /** 응답 상태 */
  status: ResponseStatus;
  /** 페이지네이션 정보 */
  pagination: PaginationInfo;
  /** 응답 데이터 */
  data: T[];
}

/**
 * 기본 응답 형식
 * @interface
 * @template T - 응답 데이터의 타입
 */
export interface ApiResponse<T> {
  /** 응답 상태 */
  status: ResponseStatus;
  /** 응답 데이터 */
  data: T;
}

/**
 * HTTP 요청 쿼리 파라미터
 * @interface
 */
export interface QueryParams {
  /** 페이지 번호 */
  page?: number;
  /** 페이지당 항목 수 */
  limit?: number;
  /** 정렬 기준 */
  sort?: string;
  /** 검색어 */
  search?: string;
  /** 필터 조건 */
  [key: string]: any;
}

/**
 * 사용자 권한 레벨
 * @readonly
 */
export enum UserRole {
  /** 일반 사용자 */
  USER = 'user',
  /** 관리자 */
  ADMIN = 'admin'
} 