
// Define types for API requests and responses
type JsonRequestBody = Record<string, unknown>;
type RequestBody = JsonRequestBody | FormData;
type ApiResponse<T = unknown> = Promise<T>;
type RequestConfig = {
  headers?: HeadersInit;
};

const getApiClient = (token?: string) => {
  const baseHeaders: HeadersInit = {};

  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`;
  }

  const get = async <T = unknown>(path: string): ApiResponse<T> => {
    const headers = { ...baseHeaders, 'Content-Type': 'application/json' };
    const response = await fetch(`http://localhost:8080${path}`, {
      headers,
    });
    return response.json() as Promise<T>;
  };

  const post = async <T = unknown>(
    path: string, 
    body: RequestBody, 
    config?: RequestConfig
  ): ApiResponse<T> => {
    // Check if body is FormData
    const isFormData = body instanceof FormData;
    
    // Set up headers based on content type
    let requestHeaders: HeadersInit;
    
    if (isFormData) {
      // For FormData, don't set Content-Type at all, let the browser handle it
      requestHeaders = { ...baseHeaders };
    } else {
      // For JSON data, set the appropriate Content-Type
      requestHeaders = { 
        ...baseHeaders, 
        'Content-Type': 'application/json',
        ...config?.headers 
      };
    }
    
    // Log the request for debugging
    console.log('API Request:', {
      url: `http://localhost:8080${path}`,
      method: 'POST',
      headers: requestHeaders,
      bodyType: isFormData ? 'FormData' : 'JSON',
      isFormData
    });
    
    const response = await fetch(`http://localhost:8080${path}`, {
      method: 'POST',
      headers: requestHeaders,
      body: isFormData ? body : JSON.stringify(body),
    });
    
    return response.json() as Promise<T>;
  };

  return {
    get,
    post,
  };
};

export default getApiClient;
