import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">403</h1>
        <h2 className="text-xl font-semibold text-gray-700">Access denied</h2>
        <p className="text-sm text-gray-600">
          Your role does not have permission to access this application.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
