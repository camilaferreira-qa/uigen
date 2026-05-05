import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
  });

  describe("initial state", () => {
    it("initializes with isLoading false", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("exposes signIn and signUp functions", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  describe("signIn", () => {
    describe("happy paths", () => {
      it("with anon work: creates project from anon data, clears it, and navigates", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "build me a button" }],
          fileSystemData: { "/App.tsx": { type: "file", content: "export default () => <button />" } },
        };
        mockSignIn.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(anonWork);
        mockCreateProject.mockResolvedValue({ id: "anon-proj-1" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringContaining("Design from"),
          messages: anonWork.messages,
          data: anonWork.fileSystemData,
        });
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-proj-1");
        expect(mockGetProjects).not.toHaveBeenCalled();
      });

      it("without anon work, with existing projects: navigates to the most recent project", async () => {
        mockSignIn.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([
          { id: "proj-recent", name: "Latest", createdAt: new Date(), updatedAt: new Date() },
          { id: "proj-old", name: "Older", createdAt: new Date(), updatedAt: new Date() },
        ] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockPush).toHaveBeenCalledWith("/proj-recent");
        expect(mockCreateProject).not.toHaveBeenCalled();
      });

      it("without anon work and no existing projects: creates a new blank project and navigates", async () => {
        mockSignIn.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "new-proj-1" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        });
        expect(mockPush).toHaveBeenCalledWith("/new-proj-1");
      });

      it("returns the result from signInAction", async () => {
        const expectedResult = { success: true };
        mockSignIn.mockResolvedValue(expectedResult);
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signIn("user@example.com", "password123");
        });

        expect(returnValue).toEqual(expectedResult);
      });
    });

    describe("failure paths", () => {
      it("does not navigate when sign-in fails", async () => {
        mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "wrong-pass");
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockGetAnonWorkData).not.toHaveBeenCalled();
        expect(mockGetProjects).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
      });

      it("returns the error result when sign-in fails", async () => {
        const errorResult = { success: false, error: "Invalid credentials" };
        mockSignIn.mockResolvedValue(errorResult);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signIn("user@example.com", "wrong-pass");
        });

        expect(returnValue).toEqual(errorResult);
      });

      it("resets isLoading to false even if signInAction throws", async () => {
        mockSignIn.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signIn("user@example.com", "password123");
          } catch {
            // expected to throw
          }
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false if createProject throws after successful sign-in", async () => {
        mockSignIn.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signIn("user@example.com", "password123");
          } catch {
            // expected to throw
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("isLoading state", () => {
      it("is true while sign-in is in-flight and false once complete", async () => {
        let resolveSignIn!: (val: { success: boolean }) => void;
        mockSignIn.mockReturnValue(
          new Promise<{ success: boolean }>((res) => {
            resolveSignIn = res;
          }) as any
        );
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

        const { result } = renderHook(() => useAuth());
        expect(result.current.isLoading).toBe(false);

        let signInPromise!: Promise<any>;
        act(() => {
          signInPromise = result.current.signIn("user@example.com", "password123");
        });

        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          resolveSignIn({ success: true });
          await signInPromise;
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false after a failed sign-in", async () => {
        mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "wrong-pass");
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("signUp", () => {
    describe("happy paths", () => {
      it("with anon work: creates project from anon data, clears it, and navigates", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "make a card component" }],
          fileSystemData: { "/App.tsx": { type: "file", content: "export default () => <div />" } },
        };
        mockSignUp.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(anonWork);
        mockCreateProject.mockResolvedValue({ id: "anon-proj-2" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("newuser@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringContaining("Design from"),
          messages: anonWork.messages,
          data: anonWork.fileSystemData,
        });
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-proj-2");
        expect(mockGetProjects).not.toHaveBeenCalled();
      });

      it("without anon work, with existing projects: navigates to the most recent project", async () => {
        mockSignUp.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([
          { id: "existing-proj", name: "My App", createdAt: new Date(), updatedAt: new Date() },
        ] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("newuser@example.com", "password123");
        });

        expect(mockPush).toHaveBeenCalledWith("/existing-proj");
        expect(mockCreateProject).not.toHaveBeenCalled();
      });

      it("without anon work and no existing projects: creates a new blank project and navigates", async () => {
        mockSignUp.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "new-proj-2" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("newuser@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        });
        expect(mockPush).toHaveBeenCalledWith("/new-proj-2");
      });

      it("returns the result from signUpAction", async () => {
        const expectedResult = { success: true };
        mockSignUp.mockResolvedValue(expectedResult);
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signUp("newuser@example.com", "password123");
        });

        expect(returnValue).toEqual(expectedResult);
      });
    });

    describe("failure paths", () => {
      it("does not navigate when sign-up fails", async () => {
        mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("existing@example.com", "password123");
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockGetAnonWorkData).not.toHaveBeenCalled();
        expect(mockGetProjects).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
      });

      it("returns the error result when sign-up fails", async () => {
        const errorResult = { success: false, error: "Email already registered" };
        mockSignUp.mockResolvedValue(errorResult);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signUp("existing@example.com", "password123");
        });

        expect(returnValue).toEqual(errorResult);
      });

      it("resets isLoading to false even if signUpAction throws", async () => {
        mockSignUp.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signUp("newuser@example.com", "password123");
          } catch {
            // expected to throw
          }
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false if createProject throws after successful sign-up", async () => {
        mockSignUp.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signUp("newuser@example.com", "password123");
          } catch {
            // expected to throw
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("isLoading state", () => {
      it("is true while sign-up is in-flight and false once complete", async () => {
        let resolveSignUp!: (val: { success: boolean }) => void;
        mockSignUp.mockReturnValue(
          new Promise<{ success: boolean }>((res) => {
            resolveSignUp = res;
          }) as any
        );
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

        const { result } = renderHook(() => useAuth());
        expect(result.current.isLoading).toBe(false);

        let signUpPromise!: Promise<any>;
        act(() => {
          signUpPromise = result.current.signUp("newuser@example.com", "password123");
        });

        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          resolveSignUp({ success: true });
          await signUpPromise;
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false after a failed sign-up", async () => {
        mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("existing@example.com", "password123");
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("anon work edge cases", () => {
    it("treats anon work with empty messages array as no anon work", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
      mockGetProjects.mockResolvedValue([{ id: "proj-1" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockClearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-1");
    });

    it("does not call clearAnonWork when sign-in fails", async () => {
      mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "wrong-pass");
      });

      expect(mockClearAnonWork).not.toHaveBeenCalled();
    });

    it("does not call clearAnonWork when sign-up fails", async () => {
      mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("existing@example.com", "password123");
      });

      expect(mockClearAnonWork).not.toHaveBeenCalled();
    });

    it("uses anon work data for project name timestamp in createProject call", async () => {
      const anonWork = {
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: {},
      };
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(anonWork);
      mockCreateProject.mockResolvedValue({ id: "proj-ts" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      const callArg = mockCreateProject.mock.calls[0][0];
      expect(callArg.name).toMatch(/^Design from /);
    });
  });
});
