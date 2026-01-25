import { vi } from "vitest";

// ============================================
// Types
// ============================================

export interface SupabaseUploadResponse {
    error: { message: string } | null;
    data: { path: string } | null;
}

export interface SupabaseDeleteResponse {
    error: { message: string } | null;
    data: { message: string }[] | null;
}

export interface SupabasePublicUrlResponse {
    data: { publicUrl: string };
}

// ============================================
// Mock Storage Bucket
// ============================================

const createMockStorageBucket = () => ({
    upload: vi.fn().mockResolvedValue({
        error: null,
        data: { path: "test-user-id/test-image.jpg" },
    }),

    remove: vi.fn().mockResolvedValue({
        error: null,
        data: [{ message: "Deleted" }],
    }),

    getPublicUrl: vi.fn().mockReturnValue({
        data: {
            publicUrl: "https://test-bucket.supabase.co/storage/v1/object/public/images/test-user-id/test-image.jpg",
        },
    }),

    list: vi.fn().mockResolvedValue({
        error: null,
        data: [],
    }),

    download: vi.fn().mockResolvedValue({
        error: null,
        data: new Blob(["test"]),
    }),

    createSignedUrl: vi.fn().mockResolvedValue({
        error: null,
        data: { signedUrl: "https://test-signed-url.com" },
    }),
});

// ============================================
// Mock Supabase Storage
// ============================================

let mockBucket = createMockStorageBucket();

export const mockSupabaseStorage = {
    from: vi.fn((bucketName: string) => mockBucket),
};

export const mockSupabaseClient = {
    storage: mockSupabaseStorage,
    auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Reset all Supabase mocks to default values
 */
export const resetSupabaseMocks = (): void => {
    mockBucket = createMockStorageBucket();
    mockSupabaseStorage.from.mockReturnValue(mockBucket);
};

/**
 * Simulate a successful upload
 */
export const simulateUploadSuccess = (
    path: string = "test-user-id/test-image.jpg"
): void => {
    mockBucket.upload.mockResolvedValue({
        error: null,
        data: { path },
    });
};

/**
 * Simulate an upload error
 */
export const simulateUploadError = (message: string = "Upload failed"): void => {
    mockBucket.upload.mockResolvedValue({
        error: { message },
        data: null,
    });
};

/**
 * Simulate a successful delete
 */
export const simulateDeleteSuccess = (): void => {
    mockBucket.remove.mockResolvedValue({
        error: null,
        data: [{ message: "Deleted" }],
    });
};

/**
 * Simulate a delete error
 */
export const simulateDeleteError = (message: string = "Delete failed"): void => {
    mockBucket.remove.mockResolvedValue({
        error: { message },
        data: null,
    });
};

/**
 * Configure public URL response
 */
export const setPublicUrl = (url: string): void => {
    mockBucket.getPublicUrl.mockReturnValue({
        data: { publicUrl: url },
    });
};

/**
 * Get the mock bucket for direct assertions
 */
export const getMockBucket = () => mockBucket;

// ============================================
// Module Mock Registration
// ============================================

// Mock the Supabase module
vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => mockSupabaseClient),
}));
