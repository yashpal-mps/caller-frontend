
const getApiClient = (token?: string) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const get = async (path: string) => {
    const response = await fetch(`http://localhost:8080${path}`, {
      headers,
    });
    return response.json();
  };

  const post = async (path: string, body: any) => {
    const response = await fetch(`http://localhost:8080${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return response.json();
  };

  return {
    get,
    post,
  };
};

export default getApiClient;
