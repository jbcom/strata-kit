"""Meshy Asset Pipeline Flow - Generate → Rig → Animate → Retexture → Review."""

from __future__ import annotations

import time
from functools import wraps
from typing import Any, Callable, TypeVar

from crewai.flow.flow import Flow, listen, start
from pydantic import BaseModel

T = TypeVar("T")


class MeshyFlowError(Exception):
    """Base exception for Meshy flow errors."""

    pass


class RetryExhaustedError(MeshyFlowError):
    """Raised when all retry attempts have been exhausted."""

    pass


class AnimationStateError(MeshyFlowError):
    """Raised when animation state is invalid."""

    pass


def with_retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for retrying failed operations with exponential backoff.

    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff: Multiplier for delay after each retry
        exceptions: Tuple of exception types to catch and retry
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            current_delay = delay
            last_exception: Exception | None = None

            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        print(
                            f"Attempt {attempt + 1}/{max_attempts} failed: {e}. "
                            f"Retrying in {current_delay:.1f}s..."
                        )
                        time.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        print(f"All {max_attempts} attempts failed for {func.__name__}")

            raise RetryExhaustedError(
                f"Operation {func.__name__} failed after {max_attempts} attempts"
            ) from last_exception

        return wrapper

    return decorator


class MeshyAssetState(BaseModel):
    """State for Meshy Asset workflow."""

    id: str = ""
    species: str = ""
    prompt: str = ""
    retexture_prompt: str = ""
    static_task_id: str = ""
    rigged_task_id: str = ""
    animations: list[dict[str, Any]] = []
    retexture_task_id: str = ""
    review_results: dict[str, Any] = {}
    errors: list[str] = []


class MeshyAssetFlow(Flow[MeshyAssetState]):
    """Standard sequence for generating GLB assets via Meshy API.

    Steps:
    1. Generate static 3D model from text
    2. Add skeleton rigging
    3. Generate animation variants (parallel)
    4. Create retextured variant
    5. Human review of all variants

    Features:
    - Automatic retry with exponential backoff for API failures
    - Bounds checking for array access
    - Error state tracking for debugging
    """

    initial_state = MeshyAssetState
    name = "meshy_asset_flow"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._factory: Any = None

    @property
    def factory(self) -> Any:
        """Lazy-load service factory."""
        if self._factory is None:
            from mesh_toolkit.services.factory import ServiceFactory

            self._factory = ServiceFactory()
        return self._factory

    def _log_error(self, error: str) -> None:
        """Log an error to state for debugging."""
        self.state.errors.append(error)
        print(f"ERROR: {error}")

    @start()
    @with_retry(max_attempts=3, delay=2.0, backoff=2.0)
    def generate_static_model(self) -> Any:
        """Text-to-3D static model generation."""
        try:
            service = self.factory.text3d()
            callback_url = self.factory.webhook_url(self.state.species, "static")

            result = service.submit_task(
                species=self.state.species, prompt=self.state.prompt, callback_url=callback_url
            )

            self.state.static_task_id = result.task_id
            print(f"Static model task submitted: {result.task_id}")
            return result
        except Exception as e:
            self._log_error(f"generate_static_model failed: {e}")
            raise

    @listen(generate_static_model)
    @with_retry(max_attempts=3, delay=2.0, backoff=2.0)
    def rig_model(self, static_result: Any) -> Any:
        """Add skeleton to model."""
        try:
            service = self.factory.rigging()
            callback_url = self.factory.webhook_url(self.state.species, "rigged")

            result = service.submit_task(
                species=self.state.species,
                model_id=static_result.task_id,
                callback_url=callback_url,
            )

            self.state.rigged_task_id = result.task_id
            print(f"Rigging task submitted: {result.task_id}")
            return result
        except Exception as e:
            self._log_error(f"rig_model failed: {e}")
            raise

    @listen(rig_model)
    @with_retry(max_attempts=3, delay=2.0, backoff=2.0)
    def animate_variants(self, rigged_result: Any) -> dict[str, Any]:
        """Trigger parallel animation tasks."""
        try:
            service = self.factory.animation()

            # Submit walk animation
            walk_callback = self.factory.webhook_url(self.state.species, "walk")
            walk = service.submit_task(
                species=self.state.species,
                model_id=rigged_result.task_id,
                animation_id="1",  # Walk
                callback_url=walk_callback,
            )

            # Submit attack animation
            attack_callback = self.factory.webhook_url(self.state.species, "attack")
            attack = service.submit_task(
                species=self.state.species,
                model_id=rigged_result.task_id,
                animation_id="4",  # Attack
                callback_url=attack_callback,
            )

            self.state.animations = [
                {"name": "walk", "task_id": walk.task_id},
                {"name": "attack", "task_id": attack.task_id},
            ]

            print(f"Animation tasks submitted: walk={walk.task_id}, attack={attack.task_id}")
            return {"walk": walk, "attack": attack}
        except Exception as e:
            self._log_error(f"animate_variants failed: {e}")
            raise

    @listen(animate_variants)
    @with_retry(max_attempts=3, delay=2.0, backoff=2.0)
    def retexture_variant(self, anim_results: dict[str, Any]) -> Any:
        """Create color variant."""
        try:
            service = self.factory.retexture()
            callback_url = self.factory.webhook_url(self.state.species, "retextured")

            result = service.submit_task(
                species=self.state.species,
                model_id=self.state.static_task_id,
                prompt=self.state.retexture_prompt,
                callback_url=callback_url,
            )

            self.state.retexture_task_id = result.task_id
            print(f"Retexture task submitted: {result.task_id}")
            return result
        except Exception as e:
            self._log_error(f"retexture_variant failed: {e}")
            raise

    def _get_animation_task_id(self, index: int, name: str) -> str:
        """Safely get animation task ID with bounds checking.

        Args:
            index: Index in the animations list
            name: Name of the animation for error messages

        Returns:
            Task ID string

        Raises:
            AnimationStateError: If index is out of bounds
        """
        if len(self.state.animations) <= index:
            raise AnimationStateError(
                f"Animation '{name}' not found at index {index}. "
                f"Only {len(self.state.animations)} animations available."
            )
        return self.state.animations[index].get("task_id", "unknown")

    @listen(retexture_variant)
    def hitl_review(self, retexture_result: Any) -> dict[str, Any]:
        """Present all variants for human review."""
        print("\n=== Asset Review Required ===")
        print(f"Static model: {self.state.static_task_id}")

        # Safe access to animations with bounds checking
        try:
            walk_task_id = self._get_animation_task_id(0, "walk")
            print(f"Walk animation: {walk_task_id}")
        except AnimationStateError as e:
            self._log_error(str(e))
            walk_task_id = "missing"

        try:
            attack_task_id = self._get_animation_task_id(1, "attack")
            print(f"Attack animation: {attack_task_id}")
        except AnimationStateError as e:
            self._log_error(str(e))
            attack_task_id = "missing"

        print(f"Retextured variant: {self.state.retexture_task_id}")

        if self.state.errors:
            print(f"\nWarning: {len(self.state.errors)} error(s) occurred during flow")

        # In production, this loads HITLReviewControls with all 4 GLBs
        # TODO: Integrate with actual HITL review UI
        review_results: dict[str, Any] = {
            "static": {"approved": True, "rating": 8},
            "walk": {"approved": walk_task_id != "missing", "rating": 7},
            "attack": {"approved": attack_task_id != "missing", "rating": 9},
            "variant": {"approved": True, "rating": 8},
            "notes": "All variants look good, ready for integration",
            "errors": self.state.errors.copy(),
        }

        self.state.review_results = review_results
        return review_results
