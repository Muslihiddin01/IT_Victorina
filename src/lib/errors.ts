// Ошибка с HTTP-кодом и понятным текстом для пользователя
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
