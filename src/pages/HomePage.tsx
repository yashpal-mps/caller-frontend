import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import getApiClient from "../services/ApiClient";

interface Contact {
  id: number;
  name: string;
  phone: string;
  created_at: string;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CallStatusState {
  isLoading: boolean;
  contactId: number | null;
  message: string;
  isError: boolean;
}

interface ApiErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
}

const HomePage = () => {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [callStatus, setCallStatus] = useState<CallStatusState>({
    isLoading: false,
    contactId: null,
    message: "",
    isError: false,
  });

  const fetchContacts = useCallback(
    async (page = 1) => {
      if (!token) return;

      setIsLoading(true);
      try {
        const apiClient = getApiClient(token || "");
        const response = await apiClient.get(
          `/contacts?page=${page}&limit=${pagination.limit}`
        );
        setContacts(response.data);
        setPagination(response.pagination);
      } catch (error) {
        console.error("Error fetching contacts:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [token, pagination.limit]
  );

  useEffect(() => {
    if (token) {
      fetchContacts();
    } else {
      navigate("/login");
    }
  }, [token, navigate, fetchContacts]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0]);
      setUploadMessage("");
    }
  };

  const handleFileUpload = async () => {
    if (!csvFile) {
      setUploadMessage("Please select a CSV file first");
      return;
    }

    setIsUploading(true);
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", csvFile);

      const apiClient = getApiClient(token || "");
      await apiClient.post("/upload-csv", formData);

      setUploadMessage("File uploaded successfully!");
      setCsvFile(null);
      // Refresh contacts after upload
      fetchContacts();
    } catch (error: unknown) {
      console.error("Upload error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : (error as ApiErrorResponse)?.response?.data?.message ||
            "Unknown error";
      setUploadMessage(`Upload failed: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCall = async (contact: Contact) => {
    setCallStatus({
      isLoading: true,
      contactId: contact.id,
      message: `Initiating call to ${contact.name}...`,
      isError: false,
    });

    try {
      const apiClient = getApiClient(token || "");
      const response = await apiClient.post("/make-call", {
        contactId: contact.id,
      });

      setCallStatus({
        isLoading: false,
        contactId: contact.id,
        message: `Call to ${contact.name} initiated successfully! Call ID: ${response.data.callId}`,
        isError: false,
      });

      setTimeout(() => {
        setCallStatus((prev) => ({
          ...prev,
          message: "",
          contactId: null,
        }));
      }, 5000);
    } catch (error: unknown) {
      console.error("Call error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : (error as ApiErrorResponse)?.response?.data?.message ||
            "Unknown error";
      setCallStatus({
        isLoading: false,
        contactId: contact.id,
        message: `Failed to initiate call: ${errorMessage}`,
        isError: true,
      });
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      fetchContacts(newPage);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with logout button */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* CSV Import Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Import CSV</h2>
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-grow">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
            </div>
            <button
              onClick={handleFileUpload}
              disabled={!csvFile || isUploading}
              className={`px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !csvFile || isUploading
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isUploading ? "Uploading..." : "Upload CSV"}
            </button>
          </div>
          {uploadMessage && (
            <p
              className={`mt-2 text-sm ${
                uploadMessage.includes("success")
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {uploadMessage}
            </p>
          )}
        </div>

        {/* Contacts Table Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Contacts</h2>

          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <p className="text-gray-500">Loading contacts...</p>
            </div>
          ) : contacts?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                No contacts found. Import a CSV file to get started.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Phone
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Added
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {contacts.length !== 0 &&
                      contacts?.map((contact) => (
                        <tr key={contact.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {contact.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {contact.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(contact.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {callStatus.contactId === contact.id &&
                            callStatus.message ? (
                              <span
                                className={`inline-block px-3 py-1 rounded-full ${
                                  callStatus.isError
                                    ? "bg-red-100 text-red-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                {callStatus.isLoading ? (
                                  <span className="flex items-center">
                                    <svg
                                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-green-600"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                    Calling...
                                  </span>
                                ) : (
                                  callStatus.message
                                )}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleCall(contact)}
                                disabled={callStatus.isLoading}
                                className={`text-green-600 hover:text-green-900 bg-green-100 hover:bg-green-200 px-3 py-1 rounded-full ${
                                  callStatus.isLoading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                <span className="mr-1">📞</span> Call
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 px-4">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className={`px-3 py-1 rounded ${
                        pagination.page === 1
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                      className={`px-3 py-1 rounded ${
                        pagination.page === pagination.totalPages
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default HomePage;
